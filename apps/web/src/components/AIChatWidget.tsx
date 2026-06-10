/**
 * AIChatWidget — Floating AI chat bubble (bottom-right)
 *
 * Layout pattern follows common open-source messenger widgets such as
 * Wolox/react-chat-widget: a fixed shell with non-shrinking header/footer
 * and one scrollable message viewport.
 *
 * The conversation itself lives in the shared chat store, so the widget
 * and the /ai-chat full page continue the same thread.
 *
 * Structure:
 *   [wrapper: fixed, flex-col, responsive width/height]
 *     ├── [header:   flex-shrink-0           ]  ← always visible, never shrinks
 *     ├── [messages: flex-1, min-h-0,
 *     │              overflow-y-auto          ]  ← fills remaining space, scrolls
 *     └── [footer:   flex-shrink-0           ]  ← always visible, never shrinks
 *           ├── [chips row]
 *           └── [composer row]
 */
"use client";

import {
  useState, useRef, useEffect,
  type KeyboardEvent, type ChangeEvent,
} from "react";
import {
  Bot, X, Send, Sparkles,
  RotateCcw, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { MarkdownLite } from "@/components/chat/MarkdownLite";
import { TypingDots } from "@/components/chat/TypingDots";
import { formatTime } from "@/lib/format";
import { useChatStore, type ChatMsg } from "@/stores/chatStore";

/* ─────────────────────────────────────────────
   Suggested chips  (only shown on first load)
───────────────────────────────────────────── */
const CHIPS = ["ดู churn risk", "ดู CLV", "ดู lifecycle", "Model health"];

const PANEL_SIZE =
  "w-[calc(100vw-24px)] h-[min(620px,calc(100dvh-24px))] sm:w-[390px] sm:h-[min(640px,calc(100dvh-48px))]";

const TEXT_WRAP =
  "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */
function Avatar() {
  return (
    <div className="w-7 h-7 rounded-full shrink-0
      bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)]
      flex items-center justify-center mb-0.5">
      <Bot size={13} className="text-white" />
    </div>
  );
}

function MessageRow({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-end gap-2 min-w-0 ${isUser ? "flex-row-reverse" : ""}`}>
      {!isUser && <Avatar />}
      <div className={`flex flex-col gap-1 min-w-0 max-w-[82%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={[
            "max-w-full px-3.5 py-2.5 text-[13px] leading-relaxed",
            TEXT_WRAP,
            isUser
              ? "rounded-2xl rounded-br-none bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-700)] text-white"
              : "rounded-2xl rounded-bl-none bg-white border border-[color:var(--line)] text-[color:var(--ink-2)] shadow-sm",
          ].join(" ")}
        >
          <MarkdownLite text={msg.content} />
        </div>
        <span className="text-[9.5px] text-[color:var(--ink-5)] px-1">
          {formatTime(msg.ts)}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   AIChatWidget
═══════════════════════════════════════════════════════════ */
export default function AIChatWidget() {
  const messages = useChatStore((s) => s.messages);
  const sending = useChatStore((s) => s.sending);
  const unread = useChatStore((s) => s.unread);
  const open = useChatStore((s) => s.widgetOpen);
  const setOpen = useChatStore((s) => s.setWidgetOpen);
  const sendMessage = useChatStore((s) => s.send);
  const resetChat = useChatStore((s) => s.reset);

  const [input, setInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* auto-scroll to bottom */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  /* focus on open (badge clears in the store) */
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [open]);

  /* auto-resize textarea — cross-browser, no fieldSizing needed */
  const resizeTA = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resizeTA();
  };

  const send = (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || sending) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    void sendMessage(text);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const firstLoad = messages.length <= 1 && !sending;

  return (
    <>
      {/* ══ FAB bubble ═══════════════════════════════════════ */}
      <button
        id="ai-chat-bubble"
        aria-label="Open Moby AI"
        onClick={() => setOpen(!open)}
        className={[
          "fixed bottom-3 right-3 z-50 sm:bottom-6 sm:right-6",
          "w-14 h-14 rounded-full",
          "bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)]",
          "text-white shadow-xl",
          "flex items-center justify-center",
          "transition-all duration-200",
          "hover:scale-110 active:scale-95",
          "ring-[3px] ring-white/25",
          open ? "opacity-0 pointer-events-none scale-90" : "opacity-100",
        ].join(" ")}
      >
        <Bot size={22} strokeWidth={1.8} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1
            rounded-full bg-red-500 text-[10px] font-bold text-white
            flex items-center justify-center leading-none">
            {unread}
          </span>
        )}
      </button>

      {/* ══ Chat panel ═══════════════════════════════════════
          Layout rules (common messenger widget pattern):
            • wrapper   → flex flex-col, FIXED size, overflow-hidden
            • header    → flex-shrink-0  (never shrinks)
            • messages  → flex-1 min-h-0 overflow-y-auto  (fills gap, scrolls)
            • footer    → flex-shrink-0  (never shrinks)
      ════════════════════════════════════════════════════════ */}
      <div
        aria-label="Moby AI chat panel"
        className={[
          "fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-6 sm:bottom-6",
          PANEL_SIZE,
          "flex flex-col",
          "rounded-2xl overflow-hidden bg-white",
          "border border-[color:var(--line)]",
          "transition-all duration-200 origin-bottom-right",
          open
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-90 pointer-events-none",
        ].join(" ")}
        style={{ boxShadow: "0 20px 60px rgba(15,23,42,.18), 0 4px 12px rgba(15,23,42,.08)" }}
      >

        {/* ── HEADER (flex-shrink-0) ─────────────────────── */}
        <header className="flex-shrink-0 flex items-center gap-3 min-w-0 px-4 py-3
          bg-gradient-to-r from-[color:var(--moby-600)] to-[color:var(--moby-800)]">
          <div className="flex items-center justify-center shrink-0">
            <Sparkles size={14} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-white leading-tight">Moby AI</p>
            <p className="truncate text-[10.5px] text-blue-200 flex items-center gap-1.5 mt-0.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Ollama Cloud · no mock insights
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href="/ai-chat"
              title="เปิดเต็มจอ"
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/25
                flex items-center justify-center text-white/80 hover:text-white transition-colors"
            >
              <ExternalLink size={12} />
            </Link>
            <button
              onClick={resetChat}
              title="รีเซ็ต"
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/25
                flex items-center justify-center text-white/80 hover:text-white transition-colors"
            >
              <RotateCcw size={12} />
            </button>
            <button
              onClick={() => setOpen(false)}
              title="ปิด"
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/25
                flex items-center justify-center text-white/80 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        {/* ── MESSAGES (flex-1 + min-h-0 = fills space, scrolls)
            min-h-0 is REQUIRED — without it, flex-1 overflows the parent
        ─────────────────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-3 bg-[#f8fafc] sm:px-4"
        >
          {messages
            .filter((msg) => !(msg.role === "assistant" && (msg.pending || msg.content.trim() === "")))
            .map((msg) => (
              <MessageRow key={msg.id} msg={msg} />
            ))}

          {/* Typing indicator */}
          {sending && (
            <div className="flex items-end gap-2">
              <Avatar />
              <div className="max-w-[82%] bg-white border border-[color:var(--line)] rounded-2xl rounded-bl-none
                px-4 py-3 shadow-sm flex items-center gap-[5px]">
                <TypingDots />
              </div>
            </div>
          )}
        </div>

        {/* ── FOOTER (flex-shrink-0) ─────────────────────────
            flex-col: chips stack above composer
        ──────────────────────────────────────────────────── */}
        <footer className="flex-shrink-0 flex flex-col border-t border-[color:var(--line)] bg-white">

          {/* Suggestion chips */}
          {firstLoad && (
            <div className="flex gap-2 px-3 pt-2.5 overflow-x-auto
              [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => send(chip)}
                  className="shrink-0 px-2.5 py-1.5 rounded-full
                    border border-[color:var(--line)]
                    bg-white text-[color:var(--moby-700)]
                    text-[11px] font-medium whitespace-nowrap
                    hover:bg-[color:var(--surface-2)] transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Composer row */}
          <div className="flex items-end gap-2 px-3 py-3">
            <div className="flex-1 min-w-0 flex items-end gap-2
              bg-[color:var(--surface-2)] border border-[color:var(--line)]
              rounded-xl px-3 py-2">
              <textarea
                ref={textareaRef}
                id="ai-chat-input"
                rows={1}
                value={input}
                onChange={handleChange}
                onKeyDown={onKey}
                placeholder="ถาม Moby AI"
                className="flex-1 resize-none bg-transparent
                  text-[13px] text-[color:var(--ink-2)]
                  placeholder:text-[color:var(--ink-5)]
                  outline-none focus:outline-none focus:ring-0 focus-visible:outline-none leading-[1.5]
                  min-h-[20px] max-h-[96px]
                  whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                style={{ overflowY: "auto" }}
              />
            </div>

            <button
              id="ai-chat-send"
              onClick={() => send()}
              disabled={!input.trim() || sending}
              className={[
                "shrink-0 w-9 h-9 rounded-xl flex items-center justify-center",
                "transition-all duration-150",
                input.trim() && !sending
                  ? "bg-[color:var(--moby-600)] text-white hover:bg-[color:var(--moby-700)] shadow-md active:scale-95"
                  : "bg-[color:var(--line)] text-[color:var(--ink-5)] cursor-not-allowed",
              ].join(" ")}
            >
              <Send size={14} strokeWidth={2} />
            </button>
          </div>

          {/* Disclaimer */}
          <p className="text-[9.5px] text-[color:var(--ink-6)] text-center pb-2 px-4 leading-tight">
            Chat API connected · no mock prediction data ·{" "}
            <Link
              href="/ai-chat"
              className="text-[color:var(--moby-500)] hover:underline"
              onClick={() => setOpen(false)}
            >
              เปิดเต็มจอ
            </Link>
          </p>
        </footer>
      </div>
    </>
  );
}
