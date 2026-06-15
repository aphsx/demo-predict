/**
 * Chat store — complete rewrite for conversation persistence + SSE streaming.
 *
 * Key changes from the old store:
 *  - Conversation-based (multiple threads, sidebar list)
 *  - SSE streaming: parses thinking / token / evidence / done / error events
 *  - Messages sourced from backend (DB-persisted), not just local state
 *  - Proper abort via AbortController
 */

import { create } from "zustand";
import { redirectingFetch } from "@/lib/http";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ChatMsg = {
  id: string;               // "db:<number>" for persisted, "opt:<timestamp>" for optimistic
  dbId?: number;
  role: "user" | "assistant";
  content: string;
  ts: number;
  pending?: boolean;        // streaming in progress
  evidence?: ChatEvidence;
};

export type ChatEvidence = {
  mode: "text_to_sql" | "direct";
  sql: string | null;
  row_count: number;
  rows: unknown[];
  columns: string[];
  warnings: string[];
  sources: string[];
};

export type Conversation = {
  id: string;
  title: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ThinkingStep = {
  step: string;
  message: string;
};

// SSE event payloads from orchestrator
type SSEThinking  = { step: string; message: string };
type SSEToken     = { text: string };
type SSEEvidence  = ChatEvidence;
type SSEDone      = { message_id: number };
type SSEError     = { message: string; code: string };

// ── State ──────────────────────────────────────────────────────────────────────

type ChatState = {
  conversations: Conversation[];
  activeId: string | null;
  messages: ChatMsg[];
  sending: boolean;
  thinkingStep: ThinkingStep | null;

  // Conversations CRUD
  loadConversations: () => Promise<void>;
  createConversation: () => Promise<string>;
  selectConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;

  // Messaging
  send: (text: string) => Promise<void>;
  cancel: () => void;
  clearMessages: () => void;

  // Widget compat (floating AIChatWidget)
  unread: number;
  widgetOpen: boolean;
  setWidgetOpen: (open: boolean) => void;
  reset: () => void;
};

// ── In-flight abort controller (outside state to avoid re-renders) ─────────────
let controller: AbortController | null = null;

// ── API helpers ────────────────────────────────────────────────────────────────

// Cookie-credentialed fetch that redirects to /login on 401 (shared with the
// other web clients via lib/http). This store is client-only, so the redirect
// always fires before the throw propagates.
const chatFetch = redirectingFetch;

async function apiGet<T>(path: string): Promise<T> {
  const res = await chatFetch(path);
  if (!res.ok) throw new Error(`API ${res.status} on GET ${path}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await chatFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(err?.message ?? `API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await chatFetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiDelete(path: string): Promise<void> {
  const res = await chatFetch(path, { method: "DELETE" });
  if (!res.ok) throw new Error(`API ${res.status}`);
}

// ── SSE stream parser ──────────────────────────────────────────────────────────

async function* readSSE(response: Response): AsyncGenerator<{ event: string; data: unknown }> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // SSE messages are separated by double newline
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";

      for (const part of parts) {
        const lines = part.split("\n");
        let event = "message";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          else if (line.startsWith("data: ")) data = line.slice(6).trim();
        }
        if (!data) continue;
        try {
          yield { event, data: JSON.parse(data) as unknown };
        } catch {
          // skip malformed
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  activeId: null,
  messages: [],
  sending: false,
  thinkingStep: null,
  unread: 0,
  widgetOpen: false,

  // ── Load conversation list ─────────────────────────────────────────────────
  loadConversations: async () => {
    try {
      const convs = await apiGet<Conversation[]>("/api/ai-chat/conversations");
      set({ conversations: convs });
    } catch {
      // silently fail — user sees empty sidebar
    }
  },

  // ── Create a new conversation ──────────────────────────────────────────────
  createConversation: async () => {
    const conv = await apiPost<Conversation>("/api/ai-chat/conversations", {});
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeId: conv.id,
      messages: [],
    }));
    return conv.id;
  },

  // ── Select + load a conversation ──────────────────────────────────────────
  selectConversation: async (id: string) => {
    if (get().activeId === id) return;
    set({ activeId: id, messages: [], sending: false, thinkingStep: null });
    controller?.abort();
    controller = null;
    try {
      const conv = await apiGet<Conversation & { messages: Array<{
        id: number;
        role: string;
        content: string;
        evidenceJson: ChatEvidence | null;
        createdAt: string;
      }> }>(`/api/ai-chat/conversations/${id}`);

      const msgs: ChatMsg[] = conv.messages.map((m) => ({
        id: `db:${m.id}`,
        dbId: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        ts: new Date(m.createdAt).getTime(),
        evidence: m.evidenceJson ?? undefined,
      }));
      set({ messages: msgs });
    } catch {
      set({ messages: [] });
    }
  },

  // ── Rename ────────────────────────────────────────────────────────────────
  renameConversation: async (id: string, title: string) => {
    await apiPatch(`/api/ai-chat/conversations/${id}`, { title });
    set((s) => ({
      conversations: s.conversations.map((c) => c.id === id ? { ...c, title } : c),
    }));
  },

  // ── Delete ────────────────────────────────────────────────────────────────
  deleteConversation: async (id: string) => {
    await apiDelete(`/api/ai-chat/conversations/${id}`);
    set((s) => {
      const convs = s.conversations.filter((c) => c.id !== id);
      const nextActive = s.activeId === id ? (convs[0]?.id ?? null) : s.activeId;
      return {
        conversations: convs,
        activeId: nextActive,
        messages: nextActive !== s.activeId ? [] : s.messages,
      };
    });
  },

  // ── Send message (SSE streaming) ───────────────────────────────────────────
  send: async (text: string) => {
    const { sending } = get();
    const content = text.trim();
    if (!content || sending) return;

    // Auto-create a conversation if none is active (widget use case)
    let activeId = get().activeId;
    if (!activeId) {
      activeId = await get().createConversation();
    }

    controller?.abort();
    controller = new AbortController();

    // Optimistic user message
    const optUserId = `opt:u-${Date.now()}`;
    const optAiId = `opt:a-${Date.now()}`;
    const userMsg: ChatMsg = { id: optUserId, role: "user", content, ts: Date.now() };
    const pendingMsg: ChatMsg = { id: optAiId, role: "assistant", content: "", ts: Date.now(), pending: true };

    set((s) => ({
      messages: [...s.messages, userMsg, pendingMsg],
      sending: true,
      thinkingStep: null,
    }));

    try {
      const res = await chatFetch(`/api/ai-chat/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(err?.message ?? `HTTP ${res.status}`);
      }

      let finalContent = "";
      let evidencePayload: ChatEvidence | undefined;
      let savedId: number | undefined;

      for await (const { event, data } of readSSE(res)) {
        switch (event) {
          case "thinking": {
            const d = data as SSEThinking;
            set({ thinkingStep: { step: d.step, message: d.message } });
            break;
          }
          case "token": {
            const d = data as SSEToken;
            finalContent += d.text;
            set((s) => ({
              thinkingStep: null,
              messages: s.messages.map((m) =>
                m.id === optAiId ? { ...m, content: finalContent } : m
              ),
            }));
            break;
          }
          case "evidence": {
            evidencePayload = data as SSEEvidence;
            break;
          }
          case "done": {
            const d = data as SSEDone;
            savedId = d.message_id;
            set((s) => ({
              messages: s.messages
                .filter((m) => m.id !== optUserId)
                .map((m) =>
                  m.id === optAiId
                    ? {
                        ...m,
                        id: `db:${savedId}`,
                        dbId: savedId,
                        content: finalContent,
                        pending: false,
                        evidence: evidencePayload,
                      }
                    : m
                ),
              thinkingStep: null,
              // bump badge when the floating widget is closed
              unread: s.widgetOpen ? s.unread : s.unread + 1,
            }));
            get().loadConversations().catch(() => null);
            break;
          }
          case "error": {
            const d = data as SSEError;
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === optAiId
                  ? { ...m, content: `เกิดข้อผิดพลาด: ${d.message}`, pending: false }
                  : m
              ),
              thinkingStep: null,
            }));
            break;
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        set((s) => ({
          messages: s.messages.filter((m) => m.id !== optUserId && m.id !== optAiId),
          thinkingStep: null,
        }));
        return;
      }
      const message = err instanceof Error ? err.message : "chat_failed";
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === optAiId
            ? { ...m, content: `เชื่อมต่อ AI ไม่สำเร็จ: ${message}`, pending: false }
            : m
        ),
        thinkingStep: null,
      }));
    } finally {
      set({ sending: false });
      controller = null;
    }
  },

  cancel: () => {
    controller?.abort();
  },

  clearMessages: () => {
    set({ messages: [], thinkingStep: null });
  },

  // ── Widget compat ────────────────────────────────────────────────────────────
  setWidgetOpen: (open: boolean) => {
    set((s) => ({ widgetOpen: open, unread: open ? 0 : s.unread }));
  },

  reset: () => {
    controller?.abort();
    controller = null;
    set({ messages: [], sending: false, thinkingStep: null, unread: 0 });
  },
}));

// ── Formatting helpers ─────────────────────────────────────────────────────────

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}
