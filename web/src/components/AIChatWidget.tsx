<<<<<<< Updated upstream
"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, X, Send, Minimize2, Maximize2, Sparkles, RotateCcw, ChevronDown } from "lucide-react";
import Link from "next/link";

/* ── types ──────────────────────────────────────────────── */
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: Date;
}

/* ── mock AI responder ──────────────────────────────────── */
const DEMO_RESPONSES: Record<string, string> = {
  default: "สวัสดีครับ! ผมคือ Moby AI Assistant ช่วยวิเคราะห์ข้อมูลลูกค้า, churn risk, CLV และ lifecycle stage ให้คุณได้ครับ 🐋",
  churn: "จากข้อมูลล่าสุด กลุ่ม **Active Paid** มี avg churn probability ที่น่ากังวล แนะนำให้ดู playbook \"High-Risk Retention\" และส่ง offer พิเศษภายใน 7 วันครับ",
  clv: "CLV (6 เดือน) ของลูกค้า Active Paid ส่วนใหญ่อยู่ในช่วง 5,000–25,000 บาท ลูกค้าที่มี CLV สูงสุดมักมี usage frequency > 15 ครั้ง/เดือนครับ",
  lifecycle: "โมเดลแบ่ง lifecycle เป็น 4 stage: **Active Paid** → **Active Free** → **Churned** → **Ghost** ลูกค้าที่ downgrade จาก Paid → Free มี comeback probability ราว 34% ครับ",
  predict: "ระบบ prediction ใช้ XGBoost ensemble ฝึกบน 90 features ครอบคลุม behavioral, transactional และ support signals ความแม่นยำ AUC-ROC ปัจจุบันอยู่ที่ 0.89 ครับ",
  alert: "ขณะนี้ไม่มี critical alert ที่ต้องการ action ด่วน ระบบ model health ทำงานปกติ ไม่พบ data drift ในรอบ 24 ชั่วโมงที่ผ่านมาครับ",
};

function getMockResponse(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("churn") || t.includes("เลิก") || t.includes("ออก")) return DEMO_RESPONSES.churn;
  if (t.includes("clv") || t.includes("มูลค่า") || t.includes("revenue")) return DEMO_RESPONSES.clv;
  if (t.includes("lifecycle") || t.includes("stage") || t.includes("status")) return DEMO_RESPONSES.lifecycle;
  if (t.includes("predict") || t.includes("โมเดล") || t.includes("model") || t.includes("ai")) return DEMO_RESPONSES.predict;
  if (t.includes("alert") || t.includes("แจ้งเตือน") || t.includes("signal")) return DEMO_RESPONSES.alert;
  return DEMO_RESPONSES.default;
}

/* ── markdown-lite renderer ─────────────────────────────── */
function renderMessage(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} className="font-semibold text-[color:var(--ink-1)]">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

/* ── suggested prompts ──────────────────────────────────── */
const SUGGESTED = [
  "วิเคราะห์ churn risk",
  "ลูกค้า CLV สูงสุด",
  "สรุป lifecycle",
  "Model health",
];

/* ── timestamp formatter ────────────────────────────────── */
function fmtTime(d: Date) {
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

/* ════════════════════════════════════════════════════════════
   Main component
   ════════════════════════════════════════════════════════════ */
export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init",
      role: "assistant",
      content: DEMO_RESPONSES.default,
      ts: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* auto-scroll */
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  /* focus input when opened */
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120);
      setUnread(0);
    }
  }, [open]);

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || thinking) return;
    setInput("");

    const userMsg: Message = { id: Date.now().toString(), role: "user", content, ts: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setThinking(true);

    await new Promise(r => setTimeout(r, 900 + Math.random() * 700));

    const reply: Message = {
      id: Date.now().toString() + "_r",
      role: "assistant",
      content: getMockResponse(content),
      ts: new Date(),
    };
    setMessages(prev => [...prev, reply]);
    setThinking(false);
    if (!open) setUnread(n => n + 1);
  }, [input, thinking, open]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const reset = () => setMessages([{ id: "init", role: "assistant", content: DEMO_RESPONSES.default, ts: new Date() }]);

  /* ── dimensions ────────────────────────────────────────── */
  const w = expanded ? "w-[680px]" : "w-[360px]";
  const h = expanded ? "h-[78vh]" : "h-[500px]";

  return (
    <>
      {/* ── floating bubble ───────────────────────────────── */}
      {!open && (
        <button
          id="ai-chat-bubble"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full
            bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)]
            shadow-xl flex items-center justify-center text-white
            hover:scale-110 active:scale-95 transition-all duration-200
            ring-4 ring-white/20"
          title="Moby AI Assistant"
          aria-label="Open AI chat"
        >
          <Bot size={24} />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
              {unread}
            </span>
          )}
        </button>
      )}

      {/* ── chat panel ───────────────────────────────────── */}
      {open && (
        <div
          className={`fixed bottom-6 right-6 z-50 ${w} ${h} flex flex-col rounded-2xl
            bg-white border border-[color:var(--line)] shadow-2xl
            transition-all duration-300 overflow-hidden`}
          style={{ boxShadow: "0 24px 64px rgba(15,23,42,.16), 0 4px 12px rgba(15,23,42,.08)" }}
        >
          {/* header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[color:var(--line)]
            bg-gradient-to-r from-[color:var(--moby-600)] to-[color:var(--moby-800)] shrink-0">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <Sparkles size={15} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold text-white leading-tight">Moby AI</div>
              <div className="text-[10.5px] text-blue-200 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                Online · ตอบทันที
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Link
                href="/ai-chat"
                title="เปิดแบบเต็มหน้าจอ"
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                onClick={() => setOpen(false)}
              >
                <Maximize2 size={13} />
              </Link>
              <button
                onClick={reset}
                title="รีเซ็ตการสนทนา"
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <RotateCcw size={13} />
              </button>
              <button
                onClick={() => setExpanded(e => !e)}
                title={expanded ? "ย่อ" : "ขยาย"}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                {expanded ? <Minimize2 size={13} /> : <ChevronDown size={13} />}
              </button>
              <button
                onClick={() => setOpen(false)}
                title="ปิด"
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#f8fafc]"
          >
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)]
                    flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={13} className="text-white" />
                  </div>
                )}
                <div className={`max-w-[78%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                  <div className={`px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed
                    ${msg.role === "user"
                      ? "bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-700)] text-white rounded-br-sm"
                      : "bg-white border border-[color:var(--line)] text-[color:var(--ink-2)] rounded-bl-sm shadow-sm"
                    }`}>
                    {renderMessage(msg.content)}
                  </div>
                  <span className="text-[10px] text-[color:var(--ink-5)] px-1">{fmtTime(msg.ts)}</span>
                </div>
              </div>
            ))}

            {/* thinking indicator */}
            {thinking && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)]
                  flex items-center justify-center shrink-0">
                  <Bot size={13} className="text-white" />
                </div>
                <div className="bg-white border border-[color:var(--line)] px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--moby-500)] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--moby-500)] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--moby-500)] animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>

          {/* suggested prompts */}
          {messages.length <= 1 && !thinking && (
            <div className="px-4 pb-2 flex gap-2 overflow-x-auto shrink-0 bg-[#f8fafc]">
              {SUGGESTED.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="shrink-0 px-3 py-1.5 rounded-full border border-[color:var(--moby-200)]
                    bg-[color:var(--moby-50)] text-[color:var(--moby-700)] text-[11.5px] font-medium
                    hover:bg-[color:var(--moby-100)] transition-colors whitespace-nowrap"
                >
                  {s}
=======
/**
 * AIChatWidget — Floating AI chat bubble (bottom-right)
 *
 * Layout pattern adapted from:
 *   https://github.com/Wolox/react-chat-widget
 *   (MIT License — Wolox Engineering)
 *
 * Structure:
 *   [wrapper: fixed, flex-col, h-[520px]]
 *     ├── [header:   flex-shrink-0           ]  ← always visible, never shrinks
 *     ├── [messages: flex-1, min-h-0,
 *     │              overflow-y-auto          ]  ← fills remaining space, scrolls
 *     └── [footer:   flex-shrink-0           ]  ← always visible, never shrinks
 *           ├── [chips row]
 *           └── [composer row]
 */
"use client";

import {
  useState, useRef, useEffect, useCallback,
  type KeyboardEvent, type ChangeEvent,
} from "react";
import {
  Bot, X, Send, Maximize2, Sparkles,
  RotateCcw, ExternalLink,
} from "lucide-react";
import Link from "next/link";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: Date;
}

/* ─────────────────────────────────────────────
   Mock response engine
───────────────────────────────────────────── */
const REPLIES: Record<string, string> = {
  default:   "สวัสดีครับ! ผมคือ **Moby AI** ช่วยวิเคราะห์ข้อมูลลูกค้า, churn risk, CLV และ lifecycle stage ให้คุณได้ครับ 🐋",
  churn:     "กลุ่ม **Active Paid** ที่มี churn probability > 60% คิดเป็นราว 12% ของพอร์ต แนะนำส่ง retention offer ภายใน 48 ชั่วโมงครับ",
  clv:       "CLV 6 เดือน — **Median:** 8,400 ฿  |  **Top 10%:** > 42,000 ฿\nลูกค้า high-CLV มักใช้งาน > 15 ครั้ง/เดือนครับ",
  lifecycle: "Lifecycle แบ่งเป็น 4 stage: **Active Paid → Active Free → Churned → Ghost**\nCome-back probability เฉลี่ยอยู่ที่ 34% ครับ",
  model:     "โมเดล XGBoost Ensemble ฝึกบน 90 features — AUC-ROC: **0.89**\nRetrain ทุก 7 วัน หรือเมื่อ drift score > 0.05 ครับ",
  alert:     "ขณะนี้ไม่มี critical alert ที่ต้องการ action ด่วน ระบบ model health ทำงานปกติครับ",
};

function getReply(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("churn") || t.includes("เลิก") || t.includes("ออก")) return REPLIES.churn;
  if (t.includes("clv") || t.includes("มูลค่า") || t.includes("revenue"))  return REPLIES.clv;
  if (t.includes("lifecycle") || t.includes("stage") || t.includes("สรุป")) return REPLIES.lifecycle;
  if (t.includes("model") || t.includes("โมเดล") || t.includes("predict")) return REPLIES.model;
  if (t.includes("alert") || t.includes("แจ้งเตือน") || t.includes("signal")) return REPLIES.alert;
  return REPLIES.default;
}

/* ─────────────────────────────────────────────
   Tiny markdown renderer  (**bold** only)
───────────────────────────────────────────── */
function Md({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, li) => (
        <span key={li} className={li > 0 ? "block mt-1" : "block"}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, pi) =>
            part.startsWith("**") && part.endsWith("**")
              ? <strong key={pi}>{part.slice(2, -2)}</strong>
              : <span key={pi}>{part}</span>
          )}
        </span>
      ))}
    </>
  );
}

/* ─────────────────────────────────────────────
   Timestamp
───────────────────────────────────────────── */
const fmt = (d: Date) =>
  d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/* ─────────────────────────────────────────────
   Suggested chips  (only shown on first load)
───────────────────────────────────────────── */
const CHIPS = ["วิเคราะห์ churn risk", "CLV สูงสุด", "สรุป lifecycle", "Model health"];

/* ═══════════════════════════════════════════════════════════
   AIChatWidget
═══════════════════════════════════════════════════════════ */
export default function AIChatWidget() {
  const INIT: Msg = {
    id: "init",
    role: "assistant",
    text: REPLIES.default,
    ts: new Date(),
  };

  const [open,     setOpen]     = useState(false);
  const [msgs,     setMsgs]     = useState<Msg[]>([INIT]);
  const [input,    setInput]    = useState("");
  const [busy,     setBusy]     = useState(false);
  const [unread,   setUnread]   = useState(0);

  const scrollRef  = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ── auto-scroll to bottom ─────────────────────────────── */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  /* ── focus & clear badge on open ──────────────────────── */
  useEffect(() => {
    if (open) {
      setUnread(0);
      // slight delay so panel animates in first
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [open]);

  /* ── auto-resize textarea (no fieldSizing needed) ─────── */
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

  /* ── send ──────────────────────────────────────────────── */
  const send = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || busy) return;

    setInput("");
    // reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", text, ts: new Date() };
    setMsgs(prev => [...prev, userMsg]);
    setBusy(true);

    await new Promise(r => setTimeout(r, 800 + Math.random() * 600));

    const botMsg: Msg = { id: `b-${Date.now()}`, role: "assistant", text: getReply(text), ts: new Date() };
    setMsgs(prev => [...prev, botMsg]);
    setBusy(false);

    if (!open) setUnread(n => n + 1);
  }, [input, busy, open]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const reset = () => setMsgs([{ ...INIT, id: `init-${Date.now()}`, ts: new Date() }]);

  const firstLoad = msgs.length <= 1 && !busy;

  /* ── render ────────────────────────────────────────────── */
  return (
    <>
      {/* ══ FAB bubble ═══════════════════════════════════════ */}
      <button
        id="ai-chat-bubble"
        aria-label="Open Moby AI"
        onClick={() => setOpen(v => !v)}
        className={[
          "fixed bottom-6 right-6 z-50",
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
          Key layout rules (from Wolox/react-chat-widget):
            • wrapper   → flex flex-col, FIXED size, overflow-hidden
            • header    → flex-shrink-0  (never shrinks)
            • messages  → flex-1 min-h-0 overflow-y-auto  (fills gap, scrolls)
            • footer    → flex-shrink-0  (never shrinks)
      ════════════════════════════════════════════════════════ */}
      <div
        aria-label="Moby AI chat panel"
        className={[
          /* position */
          "fixed bottom-6 right-6 z-50",
          /* size — fixed so flex children work correctly */
          "w-[360px] h-[520px]",
          /* flex column — the critical layout axis */
          "flex flex-col",
          /* decoration */
          "rounded-2xl overflow-hidden bg-white",
          "border border-[color:var(--line)]",
          /* animate open/close */
          "transition-all duration-200 origin-bottom-right",
          open
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-90 pointer-events-none",
        ].join(" ")}
        style={{ boxShadow: "0 20px 60px rgba(15,23,42,.18), 0 4px 12px rgba(15,23,42,.08)" }}
      >

        {/* ── HEADER (flex-shrink-0) ─────────────────────── */}
        <header className="flex-shrink-0 flex items-center gap-3 px-4 py-3
          bg-gradient-to-r from-[color:var(--moby-600)] to-[color:var(--moby-800)]">
          {/* avatar */}
          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Sparkles size={14} className="text-white" />
          </div>
          {/* title */}
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-semibold text-white leading-tight">Moby AI</p>
            <p className="text-[10.5px] text-blue-200 flex items-center gap-1.5 mt-0.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Online · ตอบทันที
            </p>
          </div>
          {/* controls */}
          <div className="flex items-center gap-1">
            <Link
              href="/ai-chat"
              title="เปิดเต็มจอ"
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/25
                flex items-center justify-center text-white/80 hover:text-white
                transition-colors"
            >
              <ExternalLink size={12} />
            </Link>
            <button
              onClick={reset}
              title="รีเซ็ต"
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/25
                flex items-center justify-center text-white/80 hover:text-white
                transition-colors"
            >
              <RotateCcw size={12} />
            </button>
            <button
              onClick={() => setOpen(false)}
              title="ปิด"
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/25
                flex items-center justify-center text-white/80 hover:text-white
                transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        {/* ── MESSAGES (flex-1 + min-h-0 = fills space, scrolls) */}
        {/*   min-h-0 is REQUIRED so flex-1 doesn't overflow parent  */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 bg-[#f8fafc]"
        >
          {msgs.map(msg => (
            <MessageRow key={msg.id} msg={msg} />
          ))}

          {/* Typing indicator */}
          {busy && (
            <div className="flex items-end gap-2">
              <Avatar />
              <div className="bg-white border border-[color:var(--line)] rounded-2xl rounded-bl-none
                px-4 py-3 shadow-sm flex items-center gap-[5px]">
                {[0, 150, 300].map(d => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 rounded-full bg-[color:var(--moby-500)] animate-bounce"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── FOOTER (flex-shrink-0) ─────────────────────────
            Contains: [chips?] + [composer]
            Uses flex-col so chips sit above composer naturally
        ──────────────────────────────────────────────────── */}
        <footer className="flex-shrink-0 flex flex-col border-t border-[color:var(--line)] bg-white">

          {/* Suggestion chips — only on first load */}
          {firstLoad && (
            <div className="flex gap-2 px-3 pt-2.5 pb-0 overflow-x-auto
              [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => send(chip)}
                  className="shrink-0 px-2.5 py-1.5 rounded-full
                    border border-[color:var(--moby-200)]
                    bg-[color:var(--moby-50)] text-[color:var(--moby-700)]
                    text-[11px] font-medium whitespace-nowrap
                    hover:bg-[color:var(--moby-100)] transition-colors"
                >
                  {chip}
>>>>>>> Stashed changes
                </button>
              ))}
            </div>
          )}

<<<<<<< Updated upstream
          {/* input */}
          <div className="px-3 py-3 border-t border-[color:var(--line)] bg-white shrink-0">
            <div className="flex items-end gap-2 bg-[color:var(--surface-2)] border border-[color:var(--line)]
              rounded-xl px-3 py-2 focus-within:border-[color:var(--moby-500)] transition-colors">
              <textarea
                ref={inputRef}
                id="ai-chat-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                rows={1}
                placeholder="ถามเรื่องลูกค้า, churn, CLV…"
                className="flex-1 resize-none bg-transparent text-[13px] text-[color:var(--ink-2)]
                  placeholder:text-[color:var(--ink-5)] outline-none max-h-[96px] leading-relaxed"
                style={{ fieldSizing: "content" } as any}
              />
              <button
                id="ai-chat-send"
                onClick={() => send()}
                disabled={!input.trim() || thinking}
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all
                  ${input.trim() && !thinking
                    ? "bg-[color:var(--moby-600)] text-white hover:bg-[color:var(--moby-700)] shadow-sm"
                    : "bg-[color:var(--line)] text-[color:var(--ink-5)] cursor-not-allowed"
                  }`}
              >
                <Send size={13} />
              </button>
            </div>
            <p className="text-[10px] text-[color:var(--ink-5)] mt-1.5 text-center">
              Demo mode · ข้อมูลจำลอง ·{" "}
              <Link href="/ai-chat" className="text-[color:var(--moby-600)] hover:underline" onClick={() => setOpen(false)}>
                เปิดแบบเต็มจอ
              </Link>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
=======
          {/* Composer row */}
          <div className="flex items-end gap-2 px-3 py-3">
            {/* Textarea wrapper */}
            <div className="flex-1 flex items-end gap-2
              bg-[color:var(--surface-2)] border border-[color:var(--line)]
              rounded-xl px-3 py-2
              focus-within:border-[color:var(--moby-400)]
              focus-within:bg-white
              transition-colors">
              <textarea
                ref={textareaRef}
                id="ai-chat-input"
                rows={1}
                value={input}
                onChange={handleChange}
                onKeyDown={onKey}
                placeholder="ถามเรื่องลูกค้า, churn, CLV…"
                className="flex-1 resize-none bg-transparent
                  text-[13px] text-[color:var(--ink-2)]
                  placeholder:text-[color:var(--ink-5)]
                  outline-none leading-[1.5]
                  min-h-[20px] max-h-[96px]"
                style={{ overflowY: "auto" }}
              />
            </div>

            {/* Send button */}
            <button
              id="ai-chat-send"
              onClick={() => send()}
              disabled={!input.trim() || busy}
              className={[
                "shrink-0 w-9 h-9 rounded-xl flex items-center justify-center",
                "transition-all duration-150",
                input.trim() && !busy
                  ? "bg-[color:var(--moby-600)] text-white hover:bg-[color:var(--moby-700)] shadow-md active:scale-95"
                  : "bg-[color:var(--line)] text-[color:var(--ink-5)] cursor-not-allowed",
              ].join(" ")}
            >
              <Send size={14} strokeWidth={2} />
            </button>
          </div>

          {/* Disclaimer */}
          <p className="text-[9.5px] text-[color:var(--ink-6)] text-center pb-2 px-4 leading-tight">
            Demo mode · ข้อมูลจำลอง ·{" "}
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

function MessageRow({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar — only for assistant */}
      {!isUser && <Avatar />}

      {/* Bubble + timestamp */}
      <div className={`flex flex-col gap-1 max-w-[76%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={[
            "px-3.5 py-2.5 text-[13px] leading-relaxed",
            isUser
              ? "rounded-2xl rounded-br-none bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-700)] text-white"
              : "rounded-2xl rounded-bl-none bg-white border border-[color:var(--line)] text-[color:var(--ink-2)] shadow-sm",
          ].join(" ")}
        >
          <Md text={msg.text} />
        </div>
        <span className="text-[9.5px] text-[color:var(--ink-5)] px-1">
          {fmt(msg.ts)}
        </span>
      </div>
    </div>
  );
}
>>>>>>> Stashed changes
