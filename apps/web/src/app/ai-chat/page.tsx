"use client";
export const dynamic = "force-dynamic";

import { useState, useRef, useEffect, useCallback, type ChangeEvent } from "react";
import {
  Send, RotateCcw, Sparkles, User,
  ChevronRight, TrendingUp, Users, AlertTriangle, Zap,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { useRunStore } from "@/stores/runStore";
import { RunUrlSync } from "@/stores/RunUrlSync";

/* ── types ──────────────────────────────────────────────── */
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: Date;
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

const TEXT_WRAP = "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]";
const CHAT_COLUMN = "mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-3 pb-3 sm:px-5 sm:pb-5 lg:px-6";
const MESSAGE_BUBBLE = "max-w-full rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed";

/* ── markdown-lite renderer ─────────────────────────────── */
function renderMessage(text: string, strongClassName = "font-semibold text-[color:var(--ink-1)]") {
  return text.split("\n").map((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, pi) =>
      p.startsWith("**") && p.endsWith("**")
        ? <strong key={pi} className={strongClassName}>{p.slice(2, -2)}</strong>
        : <span key={pi}>{p}</span>
    );
    return <span key={li} className={li > 0 ? "mt-1 block" : "block"}>{parts}</span>;
  });
}

/* ── timestamp ──────────────────────────────────────────── */
const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
};

function fmtTime(d: Date) {
  return d.toLocaleTimeString("th-TH", TIME_FORMAT);
}

/* ── example prompts ────────────────────────────────────── */
const QUICK_PROMPTS = [
  { icon: TrendingUp, label: "วิเคราะห์ churn risk ของพอร์ต" },
  { icon: Users, label: "สรุป lifecycle distribution" },
  { icon: AlertTriangle, label: "บัญชีที่มีความเสี่ยงสูงสุด" },
  { icon: Zap, label: "แนะนำ action เร่งด่วน" },
];

const WELCOME = "Moby AI จะตอบจาก Text-to-SQL และความรู้บริษัทที่มี evidence เท่านั้น\n\nหากข้อมูลไม่พอ ระบบจะบอกว่าขาดข้อมูล แทนการสร้างตัวเลขจำลอง";

function formatEvidence(evidence: ChatApiSuccess["evidence"]) {
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

/* ════════════════════════════════════════════════════════════
   Page
   ════════════════════════════════════════════════════════════ */
export default function AIChatPage() {
  const { runId } = useRunStore();

  const [messages, setMessages] = useState<Message[]>([
    { id: "init", role: "assistant", content: WELCOME, ts: new Date() },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

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

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    const userMsg: Message = { id: Date.now().toString(), role: "user", content, ts: new Date() };
    const replyId = Date.now().toString() + "_r";
    const replyMsg: Message = { id: replyId, role: "assistant", content: "", ts: new Date() };
    const nextMessages = [...messages, userMsg];
    const controller = new AbortController();

    setMessages(prev => [...prev, userMsg, replyMsg]);
    setStreaming(true);
    cancelRef.current = () => controller.abort();

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.id !== "init")
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
        }),
        signal: controller.signal,
      });

      const data = (await res.json().catch(() => null)) as ChatApiResponse | null;
      const success = data as ChatApiSuccess | null;
      if (!res.ok || !success?.message?.content) {
        const apiMessage = typeof data?.message === "string" ? data.message : null;
        throw new Error(apiMessage ?? data?.detail ?? data?.code ?? "chat_api_failed");
      }

      setMessages(prev =>
        prev.map(m => m.id === replyId
          ? { ...m, content: `${success.message!.content}${formatEvidence(success.evidence)}`, ts: new Date() }
          : m
        )
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "chat_api_failed";
      setMessages(prev =>
        prev.map(m => m.id === replyId
          ? {
              ...m,
              content: `เชื่อมต่อ Chat API ไม่สำเร็จ: ${message}`,
              ts: new Date(),
            }
          : m
        )
      );
    } finally {
      setStreaming(false);
      cancelRef.current = null;
    }
  }, [input, messages, streaming]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const reset = () => {
    cancelRef.current?.();
    setMessages([{ id: "init", role: "assistant", content: WELCOME, ts: new Date() }]);
    setStreaming(false);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const showQuick = messages.length <= 1 && !streaming;
  const thinking = streaming && messages[messages.length - 1]?.content === "";

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
              if (msg.role === "assistant" && msg.content.trim() === "") return null;

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
                    <span className="shrink-0 text-[11px] text-[color:var(--ink-5)]">{fmtTime(msg.ts)}</span>
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
                    {renderMessage(
                      msg.content,
                      msg.role === "user" ? "font-semibold text-white" : "font-semibold text-[color:var(--ink-1)]",
                    )}
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
                  <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--moby-500)] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--moby-500)] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--moby-500)] animate-bounce" style={{ animationDelay: "300ms" }} />
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
                    disabled={!input.trim() || streaming}
                    className={`flex h-9 shrink-0 items-center gap-2 rounded-xl px-4 text-[13px] font-medium transition-all
                      ${input.trim() && !streaming
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
        <aside className="hidden w-[240px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-[color:var(--line)] p-5 xl:flex">
          {showQuick && (
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
                ตัวอย่างคำถาม
              </p>
              <div className="space-y-2.5">
                {QUICK_PROMPTS.map(({ label }) => (
                  <button
                    key={label}
                    onClick={() => send(label)}
                    className={`block w-full text-left text-[12px] leading-5 text-[color:var(--ink-3)]
                      transition-colors hover:text-[color:var(--moby-700)] ${TEXT_WRAP}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] mb-3">ลิงก์ด่วน</p>
            <div className="space-y-1">
              {[
                { href: "/customers", label: "Customers" },
                { href: "/playbooks", label: "Action Queue" },
                { href: "/model-performance", label: "Model Health" },
              ].map(({ href, label }) => (
                <Link key={href} href={href}
                  className="flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px]
                    text-[color:var(--ink-3)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--ink-1)] transition-colors group">
                  <ChevronRight size={12} className="text-[color:var(--ink-5)] group-hover:text-[color:var(--moby-600)]" />
                  <span className={TEXT_WRAP}>{label}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="border-t border-[color:var(--line)] pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] mb-3">เมื่อ API พร้อม</p>
            <ul className="space-y-2.5">
              {[
                "วิเคราะห์ churn risk",
                "คำนวณ CLV",
                "ติดตาม lifecycle",
                "ตรวจ model drift",
                "แนะนำ playbook",
              ].map(cap => (
                <li key={cap} className="flex min-w-0 items-start gap-2 text-[11.5px] text-[color:var(--ink-3)]">
                  <span className="w-1 h-1 rounded-full bg-[color:var(--moby-500)] mt-1.5 shrink-0" />
                  <span className={TEXT_WRAP}>{cap}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-[color:var(--line)] pt-4 mt-auto">
            <div className="min-w-0 rounded-lg border border-[color:var(--line)] bg-white p-3">
              <p className="text-[11px] font-semibold text-[color:var(--moby-700)] mb-1">Real insights only</p>
              <p className={`text-[10.5px] text-[color:var(--ink-4)] leading-relaxed ${TEXT_WRAP}`}>
                ไม่มี fallback เป็นข้อมูลจำลอง หาก backend ยังไม่พร้อมจะแสดงสถานะรอเชื่อมต่อ
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
