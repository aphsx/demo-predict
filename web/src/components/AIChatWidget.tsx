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
                </button>
              ))}
            </div>
          )}

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
