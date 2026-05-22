"use client";
export const dynamic = "force-dynamic";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, RotateCcw, Sparkles, User,
  ChevronRight, TrendingUp, Users, AlertTriangle, Zap,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { streamChat } from "@/lib/api";
import { useRunStore } from "@/lib/runStore";

/* ── types ──────────────────────────────────────────────── */
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: Date;
}

/* ── markdown-lite renderer ─────────────────────────────── */
function renderMessage(text: string) {
  return text.split("\n").map((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, pi) =>
      p.startsWith("**") && p.endsWith("**")
        ? <strong key={pi} className="font-semibold text-[color:var(--ink-1)]">{p.slice(2, -2)}</strong>
        : <span key={pi}>{p}</span>
    );
    return <span key={li} className="block">{parts}</span>;
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

const WELCOME = "สวัสดีครับ! ผมคือ **Moby AI** — วิเคราะห์ข้อมูลลูกค้าจากรอบการประเมินที่เลือกได้เลยครับ\n\nถามเรื่อง churn risk, CLV, lifecycle, หรือขอ action ที่แนะนำก็ได้ครับ";

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

  const send = useCallback((text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    if (!runId) {
      setMessages(prev => [...prev, {
        id: Date.now() + "_err",
        role: "assistant",
        content: "กรุณาเลือก Run ก่อนครับ — ไปที่หน้า Runs แล้วเปิด run ที่ต้องการ",
        ts: new Date(),
      }]);
      return;
    }
    setInput("");

    const userMsg: Message = { id: Date.now().toString(), role: "user", content, ts: new Date() };
    const replyId = Date.now().toString() + "_r";
    const replyMsg: Message = { id: replyId, role: "assistant", content: "", ts: new Date() };

    setMessages(prev => [...prev, userMsg, replyMsg]);
    setStreaming(true);

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    cancelRef.current = streamChat(
      runId,
      history,
      (chunk) => setMessages(prev =>
        prev.map(m => m.id === replyId ? { ...m, content: m.content + chunk } : m)
      ),
      () => { setStreaming(false); cancelRef.current = null; },
      (err) => {
        setMessages(prev =>
          prev.map(m => m.id === replyId ? { ...m, content: `เกิดข้อผิดพลาด: ${err}` } : m)
        );
        setStreaming(false);
        cancelRef.current = null;
      },
    );
  }, [input, streaming, runId, messages]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const reset = () => {
    cancelRef.current?.();
    setMessages([{ id: "init", role: "assistant", content: WELCOME, ts: new Date() }]);
    setStreaming(false);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const showQuick = messages.length <= 1 && !streaming;
  const thinking = streaming && messages[messages.length - 1]?.content === "";

  return (
    <div className="h-full flex flex-col bg-[color:var(--bg)]">
      <PageHeader
        eyebrow={runId ? `AI · Run ${runId.slice(0, 8)}…` : "AI · ไม่มี run"}
        title="Moby AI Assistant"
        actions={
          <button
            onClick={reset}
            className="h-9 px-3 rounded-lg border border-[color:var(--line)] bg-white
              text-[13px] text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)]
              inline-flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw size={13} />
            Reset conversation
          </button>
        }
      />

      <div className="flex flex-1 overflow-hidden gap-0">

        {/* ── main chat column ───────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden px-6 pb-6 max-w-3xl mx-auto w-full">

          {/* messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto space-y-5 py-5 pr-1"
          >
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {/* avatar */}
                {msg.role === "assistant" ? (
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)]
                    flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                    <Sparkles size={15} className="text-white" />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-[color:var(--surface-2)] border border-[color:var(--line)]
                    flex items-center justify-center shrink-0 mt-0.5">
                    <User size={15} className="text-[color:var(--ink-3)]" />
                  </div>
                )}

                <div className={`flex flex-col gap-1 max-w-[82%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[11px] text-[color:var(--ink-5)]">
                      {msg.role === "assistant" ? "Moby AI" : "You"}
                    </span>
                    <span className="text-[11px] text-[color:var(--ink-6)]">·</span>
                    <span className="text-[11px] text-[color:var(--ink-5)]">{fmtTime(msg.ts)}</span>
                  </div>
                  <div className={`px-4 py-3 rounded-2xl text-[13.5px] leading-relaxed
                    ${msg.role === "user"
                      ? "bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-700)] text-white rounded-tr-sm"
                      : "bg-white border border-[color:var(--line)] text-[color:var(--ink-2)] rounded-tl-sm shadow-sm"
                    }`}>
                    {renderMessage(msg.content)}
                  </div>
                </div>
              </div>
            ))}

            {/* thinking */}
            {thinking && (
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)]
                  flex items-center justify-center shrink-0 shadow-md">
                  <Sparkles size={15} className="text-white animate-pulse" />
                </div>
                <div className="bg-white border border-[color:var(--line)] px-4 py-3.5 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
                  <span className="text-[12px] text-[color:var(--ink-4)]">กำลังวิเคราะห์</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--moby-500)] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--moby-500)] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--moby-500)] animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>

          {/* quick prompts */}
          {showQuick && (
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {QUICK_PROMPTS.map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  onClick={() => send(label)}
                  className="flex items-center gap-3 p-3.5 rounded-xl border border-[color:var(--line)]
                    bg-white hover:bg-[color:var(--moby-50)] hover:border-[color:var(--moby-200)]
                    text-left group transition-all shadow-sm"
                >
                  <div className="w-8 h-8 rounded-lg bg-[color:var(--moby-50)] border border-[color:var(--moby-100)]
                    flex items-center justify-center shrink-0 group-hover:bg-[color:var(--moby-100)] transition-colors">
                    <Icon size={14} className="text-[color:var(--moby-600)]" />
                  </div>
                  <span className="text-[12.5px] font-medium text-[color:var(--ink-2)] group-hover:text-[color:var(--moby-700)]">
                    {label}
                  </span>
                  <ChevronRight size={13} className="ml-auto text-[color:var(--ink-5)] group-hover:text-[color:var(--moby-500)]" />
                </button>
              ))}
            </div>
          )}

          {/* input box */}
          <div className="surface shadow-sm">
            <div className="px-4 pt-3.5 pb-2">
              <textarea
                ref={inputRef}
                id="ai-chat-page-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                rows={2}
                placeholder="ถามเรื่องลูกค้า, churn risk, CLV, model performance… (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัด)"
                className="w-full resize-none bg-transparent text-[13.5px] text-[color:var(--ink-2)]
                  placeholder:text-[color:var(--ink-5)] outline-none leading-relaxed max-h-[160px]"
              />
            </div>
            <div className="flex items-center gap-2 px-3 pb-3 border-t border-[color:var(--line)] pt-2">
              <span className="flex-1 text-[11px] text-[color:var(--ink-5)]">
                {runId ? "Gemini · ข้อมูลจาก run จริง" : "⚠ กรุณาเลือก run ก่อน"}
              </span>
              <button
                id="ai-chat-page-send"
                onClick={() => send()}
                disabled={!input.trim() || streaming}
                className={`h-9 px-4 rounded-lg text-[13px] font-medium flex items-center gap-2 transition-all
                  ${input.trim() && !streaming
                    ? "bg-[color:var(--moby-600)] text-white hover:bg-[color:var(--moby-700)] shadow-sm"
                    : "bg-[color:var(--line)] text-[color:var(--ink-5)] cursor-not-allowed"
                  }`}
              >
                <Send size={13} />
                ส่ง
              </button>
            </div>
          </div>
        </div>

        {/* ── right context panel ────────────────────────── */}
        <aside className="w-[220px] shrink-0 border-l border-[color:var(--line)] hidden xl:flex flex-col gap-4 p-5 overflow-y-auto">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] mb-3">ลิงก์ด่วน</p>
            <div className="space-y-1">
              {[
                { href: "/customers", label: "Customers" },
                { href: "/alerts", label: "Alerts" },
                { href: "/playbooks", label: "Action Queue" },
                { href: "/model-performance", label: "Model Health" },
              ].map(({ href, label }) => (
                <Link key={href} href={href}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-md text-[12.5px]
                    text-[color:var(--ink-3)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--ink-1)] transition-colors group">
                  <ChevronRight size={12} className="text-[color:var(--ink-5)] group-hover:text-[color:var(--moby-600)]" />
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="border-t border-[color:var(--line)] pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] mb-3">ความสามารถ</p>
            <ul className="space-y-2.5">
              {[
                "วิเคราะห์ churn risk",
                "คำนวณ CLV",
                "ติดตาม lifecycle",
                "ตรวจ model drift",
                "แนะนำ playbook",
              ].map(cap => (
                <li key={cap} className="flex items-start gap-2 text-[11.5px] text-[color:var(--ink-3)]">
                  <span className="w-1 h-1 rounded-full bg-[color:var(--moby-500)] mt-1.5 shrink-0" />
                  {cap}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-[color:var(--line)] pt-4 mt-auto">
            <div className="rounded-lg bg-[color:var(--moby-50)] border border-[color:var(--moby-100)] p-3">
              <p className="text-[11px] font-semibold text-[color:var(--moby-700)] mb-1">Gemini AI</p>
              <p className="text-[10.5px] text-[color:var(--ink-4)] leading-relaxed">
                วิเคราะห์จากข้อมูลจริงในรอบที่เลือก ข้อมูลไม่ถูกส่งออกนอกระบบ
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
