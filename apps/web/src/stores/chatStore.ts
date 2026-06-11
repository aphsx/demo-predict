import { create } from "zustand";
import { useRunStore } from "./runStore";

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Epoch ms — format at render time with formatTime(). */
  ts: number;
  /** Assistant placeholder awaiting the API reply. */
  pending?: boolean;
}

type ChatApiResponse = {
  model?: string;
  message?: {
    role: "assistant";
    content: string;
  } | string;
  code?: string;
  detail?: string;
};

type ChatApiSuccess = {
  model?: string;
  message?: {
    role: "assistant";
    content: string;
  };
  evidence?: {
    mode?: "text_to_sql" | "knowledge_or_direct";
    sql?: string | null;
    warnings?: string[];
    blocked_reason?: string | null;
    query_result?: {
      row_count: number;
    } | null;
    sources?: Array<{
      source: string;
      title: string;
      score: number;
    }>;
  };
};

export const CHAT_WELCOME =
  "Moby AI จะตอบจาก Text-to-SQL และความรู้บริษัทที่มี evidence เท่านั้น\n\nหากข้อมูลไม่พอ ระบบจะบอกว่าขาดข้อมูล แทนการสร้างตัวเลขจำลอง";

const WELCOME_ID = "init";

function welcomeMessage(): ChatMsg {
  return { id: WELCOME_ID, role: "assistant", content: CHAT_WELCOME, ts: Date.now() };
}

function formatEvidence(evidence: ChatApiSuccess["evidence"]): string {
  if (!evidence) return "";
  const parts: string[] = [];

  if (evidence.sql) {
    parts.push(`SQL ที่ใช้:\n${evidence.sql}`);
    parts.push(`จำนวนแถวที่อ่าน: ${evidence.query_result?.row_count ?? 0}`);
  }
  if (evidence.blocked_reason) {
    parts.push(`SQL ถูกบล็อก: ${evidence.blocked_reason}`);
  }
  if (evidence.sources?.length) {
    parts.push(`แหล่งความรู้: ${evidence.sources.map((source) => source.title).join(", ")}`);
  }
  if (evidence.warnings?.length) {
    parts.push(`คำเตือน: ${evidence.warnings.join("; ")}`);
  }

  return parts.length ? `\n\n---\n${parts.join("\n")}` : "";
}

interface ChatState {
  messages: ChatMsg[];
  sending: boolean;
  /** Badge count for the floating widget; bumped while it is closed. */
  unread: number;
  widgetOpen: boolean;
  send: (text: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
  setWidgetOpen: (open: boolean) => void;
}

// In-flight request handle — deliberately outside the store state.
let controller: AbortController | null = null;

/**
 * One conversation shared by the floating AIChatWidget and the /ai-chat page.
 * Owns the full /api/ai-chat request/parse/evidence/error flow.
 */
export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [welcomeMessage()],
  sending: false,
  unread: 0,
  widgetOpen: false,

  send: async (text: string) => {
    const content = text.trim();
    const { messages, sending } = get();
    if (!content || sending) return;

    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", content, ts: Date.now() };
    const replyId = `a-${Date.now()}`;
    const replyMsg: ChatMsg = { id: replyId, role: "assistant", content: "", ts: Date.now(), pending: true };
    const history = [...messages, userMsg]
      .filter((message) => message.id !== WELCOME_ID)
      .map((message) => ({ role: message.role, content: message.content }));
      const runId = useRunStore.getState().runId.trim();

    controller = new AbortController();
    set({ messages: [...messages, userMsg, replyMsg], sending: true });

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: history, run_id: runId || undefined }),
        signal: controller.signal,
      });

      const data = (await res.json().catch(() => null)) as ChatApiResponse | null;
      const success = data as ChatApiSuccess | null;
      if (!res.ok || !success?.message?.content) {
        const apiMessage = typeof data?.message === "string" ? data.message : null;
        throw new Error(apiMessage ?? data?.detail ?? data?.code ?? "chat_api_failed");
      }

      const reply = `${success.message.content}${formatEvidence(success.evidence)}`;
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === replyId ? { ...m, content: reply, ts: Date.now(), pending: false } : m,
        ),
        unread: state.widgetOpen ? state.unread : state.unread + 1,
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        set((state) => ({ messages: state.messages.filter((m) => m.id !== replyId) }));
        return;
      }
      const message = error instanceof Error ? error.message : "chat_api_failed";
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === replyId
            ? { ...m, content: `เชื่อมต่อ Chat API ไม่สำเร็จ: ${message}`, ts: Date.now(), pending: false }
            : m,
        ),
        unread: state.widgetOpen ? state.unread : state.unread + 1,
      }));
    } finally {
      set({ sending: false });
      controller = null;
    }
  },

  cancel: () => {
    controller?.abort();
  },

  reset: () => {
    controller?.abort();
    set({ messages: [welcomeMessage()], sending: false, unread: 0 });
  },

  setWidgetOpen: (open: boolean) => {
    set((state) => ({ widgetOpen: open, unread: open ? 0 : state.unread }));
  },
}));
