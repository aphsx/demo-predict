"use client";

import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { Send, RotateCcw, Sparkles, User } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { MarkdownLite } from "@/components/chat/MarkdownLite";
import { TypingDots } from "@/components/chat/TypingDots";
import { formatTime } from "@/lib/format";
import { useChatStore } from "@/stores/chatStore";
import { useRunStore } from "@/stores/runStore";
import { RunUrlSync } from "@/stores/RunUrlSync";
import { QuickPromptsAside } from "./QuickPromptsAside";

const TEXT_WRAP = "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]";
const CHAT_COLUMN = "mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-3 pb-3 sm:px-5 sm:pb-5 lg:px-6";
const MESSAGE_BUBBLE = "max-w-full rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed";

export function AIChatView() {
  const runId = useRunStore((s) => s.runId);
  const messages = useChatStore((s) => s.messages);
  const sending = useChatStore((s) => s.sending);
  const sendMessage = useChatStore((s) => s.send);
  const resetChat = useChatStore((s) => s.reset);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const resizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resizeInput();
  };

  const send = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    void sendMessage(content);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const reset = () => {
    resetChat();
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const showQuick = messages.length <= 1 && !sending;
  const thinking = sending && messages[messages.length - 1]?.pending === true;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--bg)]">
      <RunUrlSync />
      <PageHeader
        eyebrow={runId ? `AI · Run ${runId.slice(0, 8)}…` : "AI · ไม่มี run"}
        title="Moby AI Assistant"
        actions={
          <button
            onClick={reset}
            className="h-9 px-3 rounded-lg border border-[color:var(--line)] bg-white
              text-[13px] text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)]
              inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <RotateCcw size={13} />
            Reset conversation
          </button>
        }
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* ── main chat column ───────────────────────────── */}
        <div className={CHAT_COLUMN}>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-[color:var(--line)] bg-white shadow-[var(--shadow-1)]">
          {/* messages */}
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 space-y-4 overflow-y-auto overscroll-contain bg-[#f8fafc] px-3 py-4 sm:px-5"
          >
            {messages.map(msg => {
              if (msg.role === "assistant" && (msg.pending || msg.content.trim() === "")) return null;

              return (
              <div key={msg.id} className={`flex min-w-0 gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {/* avatar */}
                {msg.role === "assistant" ? (
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)] shadow-md">
                    <Sparkles size={15} className="text-white" />
                  </div>
                ) : (
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[color:var(--ink-3)] shadow-sm ring-1 ring-[color:var(--line)]">
                    <User size={15} className="text-[color:var(--ink-3)]" />
                  </div>
                )}

                <div
                  className={[
                    "flex min-w-0 flex-col gap-1",
                    "max-w-[min(78%,46rem)] sm:max-w-[min(74%,48rem)]",
                    msg.role === "user" ? "items-end" : "items-start",
                  ].join(" ")}
                >
                  <div className="flex max-w-full min-w-0 items-center gap-2 px-1">
                    <span className="truncate text-[11px] text-[color:var(--ink-5)]">
                      {msg.role === "assistant" ? "Moby AI" : "You"}
                    </span>
                    <span className="shrink-0 text-[11px] text-[color:var(--ink-6)]">·</span>
                    <span className="shrink-0 text-[11px] text-[color:var(--ink-5)]">{formatTime(msg.ts)}</span>
                  </div>
                  <div
                    className={[
                      MESSAGE_BUBBLE,
                      TEXT_WRAP,
                      "max-h-[min(420px,58dvh)] overflow-y-auto overscroll-contain",
                      msg.role === "user"
                        ? "rounded-tr-sm bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-700)] text-white"
                        : "rounded-tl-sm border border-[color:var(--line)] bg-white text-[color:var(--ink-2)] shadow-sm",
                    ].join(" ")}
                  >
                    <MarkdownLite
                      text={msg.content}
                      strongClassName={msg.role === "user" ? "font-semibold text-white" : "font-semibold text-[color:var(--ink-1)]"}
                    />
                  </div>
                </div>
              </div>
              );
            })}

            {/* thinking */}
            {thinking && (
              <div className="flex min-w-0 gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)] shadow-md">
                  <Sparkles size={15} className="text-white animate-pulse" />
                </div>
                <div className="flex max-w-[min(78%,46rem)] items-center gap-2 rounded-2xl rounded-tl-sm border border-[color:var(--line)] bg-white px-4 py-3.5 shadow-sm">
                  <span className="text-[12px] text-[color:var(--ink-4)]">กำลังวิเคราะห์</span>
                  <TypingDots />
                </div>
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-[color:var(--line)] bg-white">
            {/* input box */}
            <div className="p-3 sm:p-4">
              <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 py-2">
                <textarea
                  ref={inputRef}
                  id="ai-chat-page-input"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKey}
                  rows={1}
                  placeholder="ถามข้อมูลบริษัทหรือฐานข้อมูลด้วยภาษาไทย (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัด)"
                  className={`max-h-[160px] min-h-[42px] w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-[color:var(--ink-2)]
                    placeholder:text-[color:var(--ink-5)] outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ${TEXT_WRAP}`}
                  style={{ overflowY: "auto" }}
                />
                <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-[color:var(--line)] pt-2">
                  <span className={`flex-1 text-[11px] text-[color:var(--ink-5)] ${TEXT_WRAP}`}>
                    {runId ? `Ollama Cloud · Text-to-SQL · Run ${runId.slice(0, 8)}` : "Ollama Cloud · Text-to-SQL · knowledge evidence"}
                  </span>
                  <button
                    id="ai-chat-page-send"
                    onClick={() => send()}
                    disabled={!input.trim() || sending}
                    className={`flex h-9 shrink-0 items-center gap-2 rounded-xl px-4 text-[13px] font-medium transition-all
                      ${input.trim() && !sending
                        ? "bg-[color:var(--moby-600)] text-white shadow-sm hover:bg-[color:var(--moby-700)] active:scale-95"
                        : "cursor-not-allowed bg-[color:var(--line)] text-[color:var(--ink-5)]"
                      }`}
                  >
                    <Send size={13} />
                    ส่ง
                  </button>
                </div>
              </div>
            </div>
          </footer>
          </section>
        </div>

        {/* ── right context panel ────────────────────────── */}
        <QuickPromptsAside showQuick={showQuick} onPrompt={(label) => send(label)} />
      </div>
    </div>
  );
}
