"use client";

import {
  useState, useRef, useEffect, useCallback, type ChangeEvent, type KeyboardEvent,
} from "react";
import {
  Bot, Send, Plus, Trash2, Edit3, X, ChevronDown, ChevronRight,
  Database, Loader2, AlertCircle, MessageSquare, User,
} from "lucide-react";
import { MarkdownLite } from "@/components/chat/markdown-lite";
import { TypingDots } from "@/components/chat/typing-dots";
import { useChatStore, formatTime, type ChatEvidence, type Conversation } from "@/stores/chat-store";

// ── Layout constants ───────────────────────────────────────────────────────────

const VIEWPORT = "h-[calc(100dvh-4rem)]";

// ── Sidebar ────────────────────────────────────────────────────────────────────

function ConversationItem({
  conv,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  conv: Conversation;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitRename = () => {
    const t = draft.trim();
    if (t && t !== conv.title) onRename(t);
    setEditing(false);
  };

  return (
    <div
      className={[
        "group flex min-w-0 cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 transition-colors",
        active
          ? "bg-[color:var(--moby-50)] text-[color:var(--moby-700)]"
          : "text-[color:var(--ink-3)] hover:bg-gray-100",
      ].join(" ")}
      onClick={editing ? undefined : onSelect}
    >
      <MessageSquare size={13} className={active ? "shrink-0 text-[color:var(--moby-500)]" : "shrink-0 opacity-50"} />

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={commitRename}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-[12.5px]">{conv.title}</span>
      )}

      {!editing && (
        <div className="hidden shrink-0 items-center gap-1 group-hover:flex">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(conv.title); }}
            className="rounded p-0.5 hover:bg-gray-200"
            title="Rename"
          >
            <Edit3 size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded p-0.5 text-red-400 hover:bg-red-50"
            title="Delete"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

function Sidebar() {
  const {
    conversations, activeId, loadConversations,
    createConversation, selectConversation, renameConversation, deleteConversation,
  } = useChatStore();

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const handleNew = async () => {
    await createConversation();
  };

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-gray-200 bg-[#fafafa]">
      <div className="p-3">
        <button
          onClick={handleNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--moby-600)] px-3 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[color:var(--moby-700)] active:scale-[0.98]"
        >
          <Plus size={14} />
          New Chat
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-[color:var(--ink-5)]">
            ยังไม่มีการสนทนา
          </p>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                active={conv.id === activeId}
                onSelect={() => selectConversation(conv.id)}
                onRename={(title) => renameConversation(conv.id, title)}
                onDelete={() => deleteConversation(conv.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 p-3">
        <p className="text-[10px] text-[color:var(--ink-5)]">
          Moby AI · Text-to-SQL + Gen AI
        </p>
      </div>
    </aside>
  );
}

// ── Evidence panel ─────────────────────────────────────────────────────────────

function EvidencePanel({ evidence }: { evidence: ChatEvidence }) {
  const [open, setOpen] = useState(false);
  const hasData = evidence.sql || evidence.row_count > 0 || evidence.warnings.length > 0;
  if (!hasData) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-[#f8fafc]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-[11px] text-[color:var(--ink-4)] hover:bg-gray-100 transition-colors"
      >
        <Database size={11} className="shrink-0 text-[color:var(--moby-500)]" />
        <span className="flex-1 text-left font-medium">
          {evidence.mode === "text_to_sql"
            ? `SQL · ${evidence.row_count} row${evidence.row_count !== 1 ? "s" : ""}`
            : "Direct answer"}
        </span>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>

      {open && (
        <div className="border-t border-gray-200 p-3 space-y-2">
          {evidence.sql && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ink-5)]">SQL</p>
              <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-[11px] leading-relaxed text-green-300">
                <code>{evidence.sql}</code>
              </pre>
            </div>
          )}
          {evidence.warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <AlertCircle size={12} className="mt-0.5 shrink-0 text-amber-500" />
              <p className="text-[11px] text-amber-700">{evidence.warnings.join(" · ")}</p>
            </div>
          )}
          {evidence.row_count > 0 && evidence.columns.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ink-5)]">
                Result · {evidence.row_count} rows
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-gray-50">
                    <tr>
                      {evidence.columns.map((col) => (
                        <th key={col} className="border-b border-gray-200 px-2 py-1.5 text-left font-semibold text-[color:var(--ink-3)]">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(evidence.rows as Record<string, unknown>[]).slice(0, 20).map((row, ri) => (
                      <tr key={ri} className="hover:bg-gray-50">
                        {evidence.columns.map((col) => (
                          <td key={col} className="px-2 py-1.5 text-[color:var(--ink-4)]">
                            {String(row[col] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {evidence.row_count > 20 && (
                  <p className="px-3 py-1.5 text-[10px] text-[color:var(--ink-5)]">
                    + {evidence.row_count - 20} more rows
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Thinking indicator ─────────────────────────────────────────────────────────

function ThinkingBubble({ message }: { message: string }) {
  return (
    <div className="flex min-w-0 gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)] shadow-md">
        <Loader2 size={15} className="animate-spin text-white" />
      </div>
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-[12px] text-[color:var(--ink-4)]">{message}</span>
        <TypingDots />
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ onPrompt }: { onPrompt: (p: string) => void }) {
  const prompts = [
    "สรุป churn risk ของพอร์ตทั้งหมด",
    "ลูกค้าที่มี priority_score สูงสุด 10 อันดับ",
    "lifecycle distribution ในรอบนี้เป็นอย่างไร",
    "account ไหนที่ revenue_at_risk สูงที่สุด",
  ];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[color:var(--moby-500)] to-[color:var(--moby-700)] shadow-lg">
        <Bot size={28} className="text-white" />
      </div>
      <div className="text-center">
        <h2 className="text-[17px] font-semibold text-[color:var(--ink-1)]">Moby AI</h2>
        <p className="mt-1 text-[13px] text-[color:var(--ink-4)]">
          ถามข้อมูล analytics จากฐานข้อมูลได้เลย
        </p>
      </div>
      <div className="grid w-full max-w-md grid-cols-2 gap-2">
        {prompts.map((p) => (
          <button
            key={p}
            onClick={() => onPrompt(p)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-[12px] text-[color:var(--ink-3)] transition-colors hover:border-[color:var(--moby-300)] hover:bg-[color:var(--moby-50)] hover:text-[color:var(--moby-700)]"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── No conversation selected ───────────────────────────────────────────────────

function NoConversation({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <MessageSquare size={36} className="text-gray-300" />
      <div className="text-center">
        <p className="text-[14px] font-medium text-[color:var(--ink-3)]">ยังไม่มีการสนทนา</p>
        <p className="mt-1 text-[12px] text-[color:var(--ink-5)]">สร้าง New Chat เพื่อเริ่มต้น</p>
      </div>
      <button
        onClick={onCreate}
        className="flex items-center gap-2 rounded-xl bg-[color:var(--moby-600)] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[color:var(--moby-700)]"
      >
        <Plus size={14} /> New Chat
      </button>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

export function AIChatView() {
  const {
    conversations, activeId, messages, sending, thinkingStep,
    send, cancel, createConversation, selectConversation,
  } = useChatStore();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages or streaming updates
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, thinkingStep]);

  // Select first conversation on mount if none active
  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      selectConversation(conversations[0].id);
    }
  }, [conversations, activeId, selectConversation]);

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) return;

    // If no active conversation, create one first
    if (!activeId) {
      const newId = await createConversation();
      useChatStore.setState({ activeId: newId });
    }

    setInput("");
    await send(msg);
    inputRef.current?.focus();
  }, [input, activeId, createConversation, send]);

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sending) handleSend();
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize textarea
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const showMessages = messages.length > 0;

  return (
    <div className={`flex min-h-0 overflow-hidden bg-[color:var(--bg)] ${VIEWPORT}`}>
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <Sidebar />

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">

        {/* Header */}
        <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[color:var(--moby-500)] to-[color:var(--moby-700)]">
              <Bot size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[14px] font-semibold text-[color:var(--ink-1)]">
                {activeConv?.title ?? "Moby AI"}
              </h2>
              <p className="text-[11px] text-[color:var(--ink-5)]">
                Text-to-SQL · ข้อมูลเฉพาะของคุณ
              </p>
            </div>
          </div>

          {sending && (
            <button
              onClick={cancel}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-[color:var(--ink-3)] hover:bg-gray-50"
            >
              <X size={12} /> หยุด
            </button>
          )}
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f8fafc] px-4 py-4"
        >
          <div className="mx-auto w-full max-w-3xl">
            {!activeId ? (
              <NoConversation onCreate={() => createConversation()} />
            ) : !showMessages ? (
              <EmptyState onPrompt={(p) => handleSend(p)} />
            ) : (
              <div className="space-y-5">
                {messages.map((msg) => {
                  if (msg.role === "assistant" && msg.pending && !msg.content) return null;

                  return (
                    <div
                      key={msg.id}
                      className={`flex min-w-0 gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      {/* Avatar */}
                      {msg.role === "assistant" ? (
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)] shadow-sm">
                          <Bot size={13} className="text-white" />
                        </div>
                      ) : (
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm">
                          <User size={13} className="text-[color:var(--ink-4)]" />
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        className={[
                          "flex min-w-0 flex-col gap-1",
                          "max-w-[min(80%,48rem)]",
                          msg.role === "user" ? "items-end" : "items-start",
                        ].join(" ")}
                      >
                        {/* Timestamp */}
                        <span className="px-1 text-[10.5px] text-[color:var(--ink-5)]">
                          {msg.role === "assistant" ? "Moby AI" : "You"} · {formatTime(msg.ts)}
                        </span>

                        {/* Content */}
                        <div
                          className={[
                            "min-w-0 rounded-2xl px-4 py-3 text-[13px] leading-relaxed",
                            msg.role === "user"
                              ? "rounded-tr-sm bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-700)] text-white"
                              : "rounded-tl-sm border border-gray-200 bg-white text-[color:var(--ink-2)] shadow-sm",
                          ].join(" ")}
                        >
                          {msg.role === "user" ? (
                            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                              {msg.content}
                            </p>
                          ) : (
                            <>
                              <MarkdownLite
                                text={msg.content || "​"} // zero-width space keeps bubble visible while streaming
                                strongClassName="font-semibold text-[color:var(--ink-1)]"
                              />
                              {msg.pending && msg.content && (
                                <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-[color:var(--moby-500)]" />
                              )}
                            </>
                          )}
                        </div>

                        {/* Evidence panel for assistant messages */}
                        {msg.role === "assistant" && !msg.pending && msg.evidence && (
                          <div className="w-full max-w-full">
                            <EvidencePanel evidence={msg.evidence} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Thinking indicator */}
                {thinkingStep && (
                  <ThinkingBubble message={thinkingStep.message} />
                )}

                {/* Pending (no tokens yet) */}
                {sending && !thinkingStep && messages[messages.length - 1]?.pending && !messages[messages.length - 1]?.content && (
                  <ThinkingBubble message="กำลังวิเคราะห์..." />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <footer className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto w-full max-w-3xl">
            <div className="flex items-end gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-1 focus-within:ring-[color:var(--moby-300)]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKey}
                rows={1}
                disabled={sending}
                placeholder={activeId ? "ถามข้อมูล analytics… (Enter ส่ง, Shift+Enter ขึ้นบรรทัด)" : "สร้าง New Chat ก่อนเริ่มสนทนา"}
                className="max-h-[160px] min-h-[28px] flex-1 resize-none bg-transparent text-[13.5px] leading-relaxed text-[color:var(--ink-2)] placeholder:text-[color:var(--ink-5)] outline-none"
                style={{ overflowY: "auto" }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || sending}
                className={[
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all",
                  input.trim() && !sending
                    ? "bg-[color:var(--moby-600)] text-white shadow-sm hover:bg-[color:var(--moby-700)] active:scale-95"
                    : "cursor-not-allowed bg-gray-100 text-[color:var(--ink-5)]",
                ].join(" ")}
              >
                <Send size={14} />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10.5px] text-[color:var(--ink-6)]">
              Moby AI อาจผิดพลาด — ตรวจสอบข้อมูลสำคัญเสมอ
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
