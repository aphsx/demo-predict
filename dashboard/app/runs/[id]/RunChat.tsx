"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  runId:   number;
  runName: string;
}

const EXAMPLE_QUESTIONS = [
  "ลูกค้าที่เสี่ยงสุดและ LTV สูงสุด 5 คนคือใคร?",
  "Champions กับ At Risk ต่างกันยังไงในข้อมูลชุดนี้?",
  "มีลูกค้าเครดิตหมดภายใน 7 วันกี่คน?",
  "ภาพรวม High Risk ทั้งหมดเป็นยังไง?",
];

function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <p className="font-bold text-sm mb-1">{children}</p>,
        h2: ({ children }) => <p className="font-bold text-sm mb-1">{children}</p>,
        h3: ({ children }) => <p className="font-semibold text-sm mb-0.5">{children}</p>,
        p:  ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-sm">{children}</li>,
        code: ({ children }) => (
          <code className="bg-gray-100 text-gray-700 rounded px-1 py-0.5 text-[11px] font-mono">
            {children}
          </code>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-semibold whitespace-nowrap">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-gray-200 px-2 py-1">{children}</td>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-gray-300 pl-3 text-gray-500 italic mb-1.5">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-2 border-gray-200" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default function RunChat({ runId, runName }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `สวัสดีครับ! ผมพร้อมวิเคราะห์ข้อมูล **${runName}** ให้คุณแล้วครับ\n\nถามได้ทั้งข้อมูลลูกค้า, การ predict, หรือคำถามทั่วไปเกี่ยวกับระบบและบริษัทได้เลยครับ`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setMessages((prev) => [...prev, { role: "user", content }]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, history, run_id: runId, run_name: runName }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "ขออภัย ไม่ได้รับคำตอบ" }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ ไม่สามารถติดต่อ AI ได้ กรุณาตรวจสอบว่า API และ Ollama ทำงานอยู่" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[520px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
        {messages.map((msg, i) => (
          <div key={i} className={`flex items-end gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-[#005AE2] flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold self-start mt-1">
                AI
              </div>
            )}
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#005AE2] text-white rounded-br-sm whitespace-pre-wrap"
                  : "bg-white text-gray-700 border border-gray-100 shadow-sm rounded-bl-sm"
              }`}
            >
              {msg.role === "assistant" ? (
                <MarkdownMessage content={msg.content} />
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-end gap-2">
            <div className="w-6 h-6 rounded-full bg-[#005AE2] flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold">
              AI
            </div>
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
              {[0, 0.15, 0.3].map((delay, j) => (
                <span key={j} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick questions */}
      {messages.length <= 1 && (
        <div className="px-4 py-2 bg-white border-t border-gray-100 flex gap-1.5 overflow-x-auto">
          {EXAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              className="flex-shrink-0 text-[10px] bg-blue-50 text-[#005AE2] border border-blue-100 rounded-full px-3 py-1.5 hover:bg-blue-100 transition-colors font-medium"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="bg-white px-4 py-3 border-t border-gray-100 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder={`ถามเกี่ยวกับ "${runName}" หรือข้อมูลบริษัท...`}
          disabled={loading}
          className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-[#005AE2] focus:ring-1 focus:ring-[#005AE2]/20 transition-all"
        />
        <button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[#005AE2] text-white flex-shrink-0 hover:bg-[#004acc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 ml-0.5">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
