/**
 * Chat store — conversation persistence + SSE streaming.
 *
 * Design notes:
 *  - Conversation-based (multiple threads, sidebar list), each optionally bound
 *    to a prediction run. The binding is fixed at creation; switching the active
 *    run never rewrites an existing thread.
 *  - Streaming is O(1) per token: the in-flight assistant message lives in a
 *    dedicated `streaming` slot, so committed `messages` are not re-mapped on
 *    every token. On completion the streamed message is committed once.
 *  - SSE event names mirror apps/api/src/lib/ai/constants.ts (SSE_EVENT).
 *  - Abort via AbortController kept outside state to avoid re-renders.
 */

import { create } from "zustand";
import { redirectingFetch } from "@/lib/http";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ChatMsg = {
  id: string; // "db:<n>" persisted, "opt:<ts>" optimistic
  dbId?: number;
  role: "user" | "assistant";
  content: string;
  ts: number;
  evidence?: ChatEvidence;
  error?: boolean;
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
  runId: string | null;
  runName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ThinkingStep = { step: string; message: string };
export type StreamingMsg = { id: string; content: string; evidence?: ChatEvidence };
export type LLMPublicConfig = { configured: boolean; provider: string; model: string };

// SSE payloads
type SSEThinking = { step: string; message: string };
type SSEToken = { text: string };
type SSETitle = { title: string };
type SSEDone = { message_id: number };
type SSEError = { message: string; code: string };

// ── State ──────────────────────────────────────────────────────────────────────

type ChatState = {
  config: LLMPublicConfig | null;
  conversations: Conversation[];
  showArchived: boolean;
  activeId: string | null;
  messages: ChatMsg[];
  streaming: StreamingMsg | null;
  sending: boolean;
  thinkingStep: ThinkingStep | null;
  /** Run id the NEXT new conversation will be bound to (null = global). */
  pendingRunId: string | null;

  loadConfig: () => Promise<void>;
  loadConversations: () => Promise<void>;
  createConversation: (runId?: string | null) => Promise<string>;
  selectConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  archiveConversation: (id: string, archived: boolean) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  setPendingRun: (runId: string | null) => void;
  setShowArchived: (v: boolean) => void;

  send: (text: string) => Promise<void>;
  cancel: () => void;
  clearMessages: () => void;

  // Floating widget
  unread: number;
  widgetOpen: boolean;
  setWidgetOpen: (open: boolean) => void;
  reset: () => void;
};

let controller: AbortController | null = null;

// ── API helpers ────────────────────────────────────────────────────────────────

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
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        let event = "message";
        let data = "";
        for (const line of part.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          else if (line.startsWith("data: ")) data = line.slice(6).trim();
        }
        if (!data) continue;
        try {
          yield { event, data: JSON.parse(data) as unknown };
        } catch {
          /* skip malformed */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>()((set, get) => ({
  config: null,
  conversations: [],
  showArchived: false,
  activeId: null,
  messages: [],
  streaming: null,
  sending: false,
  thinkingStep: null,
  pendingRunId: null,
  unread: 0,
  widgetOpen: false,

  loadConfig: async () => {
    try {
      set({ config: await apiGet<LLMPublicConfig>("/api/ai-chat/config") });
    } catch {
      set({ config: { configured: false, provider: "", model: "" } });
    }
  },

  loadConversations: async () => {
    try {
      set({ conversations: await apiGet<Conversation[]>("/api/ai-chat/conversations") });
    } catch {
      /* empty sidebar on failure */
    }
  },

  createConversation: async (runId?: string | null) => {
    const bind = runId !== undefined ? runId : get().pendingRunId;
    const conv = await apiPost<Conversation>("/api/ai-chat/conversations", {
      run_id: bind ?? undefined,
    });
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeId: conv.id,
      messages: [],
      streaming: null,
      thinkingStep: null,
    }));
    return conv.id;
  },

  selectConversation: async (id: string) => {
    if (get().activeId === id) return;
    controller?.abort();
    controller = null;
    set({ activeId: id, messages: [], streaming: null, sending: false, thinkingStep: null });
    try {
      const conv = await apiGet<
        Conversation & {
          messages: Array<{
            id: number;
            role: string;
            content: string;
            evidenceJson: ChatEvidence | null;
            createdAt: string;
          }>;
        }
      >(`/api/ai-chat/conversations/${id}`);
      const msgs: ChatMsg[] = conv.messages.map((m) => ({
        id: `db:${m.id}`,
        dbId: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        ts: new Date(m.createdAt).getTime(),
        evidence: m.evidenceJson ?? undefined,
      }));
      // Ignore late responses if the user switched away mid-load.
      if (get().activeId === id) set({ messages: msgs });
    } catch {
      if (get().activeId === id) set({ messages: [] });
    }
  },

  renameConversation: async (id: string, title: string) => {
    await apiPatch(`/api/ai-chat/conversations/${id}`, { title });
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
  },

  archiveConversation: async (id: string, archived: boolean) => {
    await apiPatch(`/api/ai-chat/conversations/${id}`, { archived });
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, archived } : c)),
    }));
  },

  deleteConversation: async (id: string) => {
    await apiDelete(`/api/ai-chat/conversations/${id}`);
    set((s) => {
      const conversations = s.conversations.filter((c) => c.id !== id);
      const switching = s.activeId === id;
      const nextActive = switching ? null : s.activeId;
      return {
        conversations,
        activeId: nextActive,
        messages: switching ? [] : s.messages,
        streaming: switching ? null : s.streaming,
      };
    });
  },

  setPendingRun: (runId: string | null) => set({ pendingRunId: runId }),
  setShowArchived: (v: boolean) => set({ showArchived: v }),

  send: async (text: string) => {
    const content = text.trim();
    if (!content || get().sending) return;

    let activeId = get().activeId;
    if (!activeId) activeId = await get().createConversation();

    controller?.abort();
    controller = new AbortController();

    const userMsg: ChatMsg = { id: `opt:u-${Date.now()}`, role: "user", content, ts: Date.now() };
    const streamId = `opt:a-${Date.now()}`;

    set((s) => ({
      messages: [...s.messages, userMsg],
      streaming: { id: streamId, content: "" },
      sending: true,
      thinkingStep: null,
    }));

    // Token buffer kept local so per-token updates stay O(1).
    let acc = "";
    let evidence: ChatEvidence | undefined;

    const commitAssistant = (final: string, opts: { error?: boolean } = {}) => {
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: streamId,
            role: "assistant",
            content: final,
            ts: Date.now(),
            evidence,
            error: opts.error,
          },
        ],
        streaming: null,
        thinkingStep: null,
        unread: s.widgetOpen ? s.unread : s.unread + 1,
      }));
    };

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

      for await (const { event, data } of readSSE(res)) {
        switch (event) {
          case "thinking":
            set({ thinkingStep: data as SSEThinking });
            break;
          case "token":
            acc += (data as SSEToken).text;
            set((s) => ({
              thinkingStep: null,
              streaming: s.streaming ? { ...s.streaming, content: acc } : s.streaming,
            }));
            break;
          case "title": {
            const title = (data as SSETitle).title;
            set((s) => ({
              conversations: s.conversations.map((c) =>
                c.id === activeId ? { ...c, title } : c
              ),
            }));
            break;
          }
          case "evidence":
            evidence = data as ChatEvidence;
            break;
          case "done":
            commitAssistant(acc);
            void get().loadConversations();
            break;
          case "error":
            commitAssistant(`เกิดข้อผิดพลาด: ${(data as SSEError).message}`, { error: true });
            break;
        }
      }
      // Stream ended without an explicit done/error (e.g. truncated): commit what we have.
      if (get().streaming?.id === streamId) commitAssistant(acc || "การเชื่อมต่อถูกตัด");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Drop the optimistic user message + streaming bubble.
        set((s) => ({
          messages: s.messages.filter((m) => m.id !== userMsg.id),
          streaming: null,
          thinkingStep: null,
        }));
        return;
      }
      const message = err instanceof Error ? err.message : "chat_failed";
      commitAssistant(`เชื่อมต่อ AI ไม่สำเร็จ: ${message}`, { error: true });
    } finally {
      set({ sending: false });
      controller = null;
    }
  },

  cancel: () => controller?.abort(),

  clearMessages: () => set({ messages: [], streaming: null, thinkingStep: null }),

  setWidgetOpen: (open: boolean) => set((s) => ({ widgetOpen: open, unread: open ? 0 : s.unread })),

  reset: () => {
    controller?.abort();
    controller = null;
    set({
      activeId: null,
      messages: [],
      streaming: null,
      sending: false,
      thinkingStep: null,
      unread: 0,
    });
  },
}));

// ── Formatting helpers ─────────────────────────────────────────────────────────

export { formatTime } from "@/lib/format";
