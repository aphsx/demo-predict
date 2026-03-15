"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const MAX_STORED_MESSAGES = 100;

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

function storageKey(runId: number) {
  return `chat_1moby_run_${runId}`;
}

function makeWelcome(runName: string): ChatMessage {
  return {
    role: "assistant",
    content: `สวัสดีครับ! ผมพร้อมวิเคราะห์ข้อมูล **${runName}** ให้คุณแล้วครับ\n\nถามได้ทั้งข้อมูลลูกค้า, การ predict, หรือคำถามทั่วไปเกี่ยวกับระบบและบริษัทได้เลยครับ`,
  };
}

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
  const [messages, setMessages] = useState<ChatMessage[]>([makeWelcome(runName)]);
  const [hydrated,         setHydrated]         = useState(false);
  const [input,            setInput]            = useState("");
  const [loading,          setLoading]          = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [sqlStatus,        setSqlStatus]        = useState<string | null>(null);
  const streamingRef = useRef("");
  const bottomRef    = useRef<HTMLDivElement>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey(runId));
      if (saved) {
        const parsed: ChatMessage[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch { /* ignore corrupt storage */ }
    setHydrated(true);
  }, [runId]);

  // Persist history whenever messages change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    try {
      const toStore = messages.slice(-MAX_STORED_MESSAGES);
      localStorage.setItem(storageKey(runId), JSON.stringify(toStore));
    } catch { /* ignore quota errors */ }
  }, [messages, hydrated, runId]);

  function clearChat() {
    const fresh = [makeWelcome(runName)];
    setMessages(fresh);
    try { localStorage.removeItem(storageKey(runId)); } catch { /* ignore */ }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, loading]);

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content }]);
    setInput("");
    setLoading(true);
    setSqlStatus(null);
    setStreamingContent("");
    streamingRef.current = "";
    let accumulated = "";  // local closure var — immune to ref timing issues

    try {
      const res = await fetch(`${API}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, history, run_id: runId, run_name: runName }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      const processSSE = (raw: string) => {
        if (!raw.startsWith("data: ")) return;
        try {
          const data = JSON.parse(raw.slice(6));
          if (data.t !== undefined) {
            setSqlStatus(null);
            accumulated += data.t;
            streamingRef.current = accumulated;
            setStreamingContent(accumulated);
          } else if (data.sql) {
            setSqlStatus("กำลังค้นหาข้อมูล...");
          } else if (data.error) {
            accumulated = data.error;
            streamingRef.current = accumulated;
            setStreamingContent(accumulated);
          } else if (data.done) {
            setMessages((prev) => [...prev, { role: "assistant", content: accumulated || "ขออภัย ไม่ได้รับคำตอบ" }]);
            setStreamingContent(null);
            accumulated = "";
            streamingRef.current = "";
          }
        } catch { /* ignore malformed chunks */ }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Flush decoder + process any remaining buffer
          buffer += decoder.decode();
          buffer.split("\n\n").forEach(processSSE);
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        parts.forEach(processSSE);
      }

      // Safety net: stream ended without a done event
      if (accumulated) {
        setMessages((prev) => [...prev, { role: "assistant", content: accumulated }]);
        setStreamingContent(null);
        streamingRef.current = "";
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ ไม่สามารถติดต่อ AI ได้ กรุณาตรวจสอบว่า API และ Ollama ทำงานอยู่" },
      ]);
      setStreamingContent(null);
      streamingRef.current = "";
    } finally {
      setLoading(false);
      setSqlStatus(null);
    }
  }

  return (
    <div className="flex flex-col h-[560px]">
      {/* ── Header (Hostinger-style) ── */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 bg-white">
        <div className="w-8 h-8 rounded-full bg-[#005AE2] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
          AI
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 leading-tight truncate">1MOBY AI Assistant</p>
          <p className="text-[11px] text-gray-400 leading-tight truncate">{runName}</p>
        </div>
        {/* New Chat button — Hostinger style */}
        <button
          onClick={clearChat}
          disabled={loading}
          title="เริ่มบทสนทนาใหม่"
          className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 hover:text-[#005AE2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2 py-1.5 rounded-lg hover:bg-blue-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span className="hidden sm:inline">New Chat</span>
        </button>
      </div>
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

        {streamingContent !== null && (
          <div className="flex items-end gap-2">
            <div className="w-6 h-6 rounded-full bg-[#005AE2] flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold self-start mt-1">
              AI
            </div>
            <div className="max-w-[85%] bg-white text-gray-700 border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed">
              {streamingContent === "" ? (
                sqlStatus ? (
                  <span className="text-[11px] text-gray-400">{sqlStatus}</span>
                ) : (
                  <div className="flex gap-1 items-center">
                    {[0, 0.15, 0.3].map((delay, j) => (
                      <span key={j} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}s` }} />
                    ))}
                  </div>
                )
              ) : (
                <MarkdownMessage content={streamingContent} />
              )}
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
