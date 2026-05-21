"use client";
export const dynamic = "force-dynamic";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot, Send, RotateCcw, Sparkles, User, Paperclip,
  ChevronRight, Clock, TrendingUp, Users, AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";

/* ── types ──────────────────────────────────────────────── */
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: Date;
}

/* ── mock responses ─────────────────────────────────────── */
const DEMO_RESPONSES: Record<string, string> = {
  default: "สวัสดีครับ! ผมคือ **Moby AI Assistant** ผู้เชี่ยวชาญด้าน Customer Intelligence ช่วยวิเคราะห์ข้อมูลลูกค้า, churn risk, CLV และ lifecycle stage ให้คุณได้ครับ 🐋\n\nคุณต้องการทราบเรื่องอะไรเป็นพิเศษครับ?",
  churn: "จากข้อมูลล่าสุด:\n\n**กลุ่มที่ต้องระวัง:**\n- Active Paid ที่มี churn probability > 60% มีราว 12% ของพอร์ต\n- กลุ่มที่ usage ลด > 40% ใน 30 วันที่ผ่านมา มีความเสี่ยงสูง\n\n**แนะนำ action:**\n1. ส่ง win-back offer ภายใน 48 ชั่วโมง\n2. Assign CSM สำหรับ high-value accounts\n3. ดู playbook \"Churn Prevention\" ในระบบ\n\nต้องการดูรายชื่อลูกค้ากลุ่มเสี่ยงไหมครับ?",
  clv: "**CLV 6 เดือน — สรุปพอร์ต:**\n\n- **Median:** 8,400 บาท\n- **Top 10%:** > 42,000 บาท\n- **Bottom 20%:** < 1,200 บาท\n\nลูกค้า high-CLV มักมี:\n- ใช้งาน > 15 ครั้ง/เดือน\n- มี 2+ product lines\n- Support ticket น้อย (< 2/เดือน)\n\nต้องการดู breakdown ตาม lifecycle stage ไหมครับ?",
  lifecycle: "**Customer Lifecycle — 4 Stages:**\n\n🔵 **Active Paid** — ลูกค้าที่จ่ายและ active\n🟣 **Active Free** — ใช้งานแต่ยังไม่จ่าย (conversion target)\n🟠 **Churned** — เคยจ่ายแล้วหยุด (win-back target)\n⚪ **Ghost** — ไม่เคยใช้งานจริง\n\n**Transition probability (avg):**\n- Free → Paid: 28%\n- Paid → Churned: 14%\n- Churned → Paid: 34%\n\nต้องการ drill down stage ไหนครับ?",
  predict: "**Model Architecture:**\n\nระบบใช้ **XGBoost Ensemble** ฝึกบน 90 features:\n- Behavioral (frequency, recency, session depth)\n- Transactional (MRR, invoice count, payment delays)\n- Support signals (ticket count, severity)\n- Engagement (login streak, feature usage)\n\n**Performance metrics:**\n- AUC-ROC: **0.89**\n- Precision@10%: **0.76**\n- Recall@High-risk: **0.82**\n\nโมเดล retrain ทุก 7 วัน หรือเมื่อ drift score > 0.05 ครับ",
  alert: "**Real-time Signal Status:**\n\n✅ Model Health — ปกติ\n✅ Data Pipeline — ทำงานปกติ\n✅ Feature Drift — ไม่พบ\n\n**24h Summary:**\n- Predictions generated: 3,412\n- High-risk flagged: 187 accounts\n- Playbooks triggered: 23 actions\n\nไม่มี critical alert ที่ต้องการ action ด่วนครับ",
  hello: "สวัสดีครับ! ยินดีให้บริการ 😊\n\nผมช่วยได้เรื่อง:\n- **วิเคราะห์ churn risk** ของลูกค้า\n- **CLV forecasting** และ revenue projection\n- **Lifecycle movement** และ conversion pathway\n- **Model performance** และ feature importance\n- **Playbook recommendations** สำหรับแต่ละ segment\n\nถามมาได้เลยครับ!",
};

function getMockResponse(text: string): string {
  const t = text.toLowerCase();
  if (t.match(/^(hi|hello|สวัสดี|ดีครับ|ดีค่ะ)/)) return DEMO_RESPONSES.hello;
  if (t.includes("churn") || t.includes("เลิก") || t.includes("ออก") || t.includes("risk")) return DEMO_RESPONSES.churn;
  if (t.includes("clv") || t.includes("มูลค่า") || t.includes("revenue") || t.includes("value")) return DEMO_RESPONSES.clv;
  if (t.includes("lifecycle") || t.includes("stage") || t.includes("status") || t.includes("สรุป")) return DEMO_RESPONSES.lifecycle;
  if (t.includes("predict") || t.includes("โมเดล") || t.includes("model") || t.includes("ai") || t.includes("health")) return DEMO_RESPONSES.predict;
  if (t.includes("alert") || t.includes("แจ้งเตือน") || t.includes("signal")) return DEMO_RESPONSES.alert;
  return DEMO_RESPONSES.default;
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
function fmtTime(d: Date) {
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

/* ── example prompts ────────────────────────────────────── */
const QUICK_PROMPTS = [
  { icon: TrendingUp, label: "วิเคราะห์ churn risk" },
  { icon: Users, label: "สรุป lifecycle stages" },
  { icon: AlertTriangle, label: "ดู real-time alerts" },
  { icon: Clock, label: "Model health status" },
];

/* ════════════════════════════════════════════════════════════
   Page
   ════════════════════════════════════════════════════════════ */
export default function AIChatPage() {
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || thinking) return;
    setInput("");

    const userMsg: Message = { id: Date.now().toString(), role: "user", content, ts: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setThinking(true);

    await new Promise(r => setTimeout(r, 900 + Math.random() * 800));

    const reply: Message = {
      id: Date.now().toString() + "_r",
      role: "assistant",
      content: getMockResponse(content),
      ts: new Date(),
    };
    setMessages(prev => [...prev, reply]);
    setThinking(false);
  }, [input, thinking]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const reset = () => {
    setMessages([{ id: "init", role: "assistant", content: DEMO_RESPONSES.default, ts: new Date() }]);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const showQuick = messages.length <= 1 && !thinking;

  return (
    <div className="h-full flex flex-col bg-[color:var(--bg)]">
      <PageHeader
        eyebrow="AI · Demo mode"
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
              <button
                className="w-8 h-8 rounded-lg border border-[color:var(--line)] flex items-center justify-center
                  text-[color:var(--ink-4)] hover:bg-[color:var(--surface-2)] transition-colors"
                title="แนบไฟล์ (ยังไม่รองรับใน demo)"
              >
                <Paperclip size={14} />
              </button>
              <span className="flex-1 text-[11px] text-[color:var(--ink-5)]">
                Demo mode · ข้อมูลจำลอง ไม่ใช่ข้อมูลจริง
              </span>
              <button
                id="ai-chat-page-send"
                onClick={() => send()}
                disabled={!input.trim() || thinking}
                className={`h-9 px-4 rounded-lg text-[13px] font-medium flex items-center gap-2 transition-all
                  ${input.trim() && !thinking
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
              <p className="text-[11px] font-semibold text-[color:var(--moby-700)] mb-1">Demo Mode</p>
              <p className="text-[10.5px] text-[color:var(--ink-4)] leading-relaxed">
                ข้อมูลทั้งหมดเป็นการจำลอง เพื่อ demo ระบบ ยังไม่ต่อ LLM จริง
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
