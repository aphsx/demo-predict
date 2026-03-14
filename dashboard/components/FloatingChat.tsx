"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    tools_used?: string[];
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

const TOOL_LABELS: Record<string, string> = {
    get_customer:      "ดึงข้อมูลลูกค้า",
    compare_customers: "เปรียบเทียบลูกค้า",
    list_customers:    "ค้นหาลูกค้า",
    get_churn_stats:   "สถิติภาพรวม",
    get_top_customers: "ลูกค้า Top-N",
};

const EXAMPLE_QUESTIONS = [
    "ลูกค้า ACC010030 กับ ACC010001 ใครน่าเก็บไว้กว่ากัน?",
    "ลูกค้าที่เสี่ยงสูงที่สุด 5 คนคือใคร?",
    "ทำไม Champions ถึงยอดซื้อมากกว่า Lost?",
    "อัตรา churn ตอนนี้เป็นยังไง?",
];

export default function FloatingChat() {
    const [isOpen,    setIsOpen]    = useState(false);
    const [messages,  setMessages]  = useState<ChatMessage[]>([
        { role: "assistant", content: "สวัสดีครับ! ผมช่วยวิเคราะห์ข้อมูลลูกค้าและตอบคำถามเกี่ยวกับ churn ได้เลยครับ 😊" },
    ]);
    const [input,     setInput]     = useState("");
    const [loading,   setLoading]   = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    async function sendMessage(text?: string) {
        const content = (text ?? input).trim();
        if (!content || loading) return;

        const userMsg: ChatMessage = { role: "user", content };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setLoading(true);

        try {
            const history = messages
                .filter(m => m.role === "user" || m.role === "assistant")
                .map(m => ({ role: m.role, content: m.content }));

            const res = await fetch(`${API}/api/chat`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ message: content, history }),
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();
            setMessages(prev => [
                ...prev,
                {
                    role:       "assistant",
                    content:    data.reply || "ขออภัย ไม่ได้รับคำตอบ",
                    tools_used: data.tools_used ?? [],
                },
            ]);
        } catch {
            setMessages(prev => [
                ...prev,
                { role: "assistant", content: "⚠️ ไม่สามารถติดต่อ AI ได้ กรุณาตรวจสอบว่า API และ Ollama ทำงานอยู่" },
            ]);
        } finally {
            setLoading(false);
        }
    }

    function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            {/* Chat Window */}
            {isOpen && (
                <div className="mb-4 w-[360px] h-[520px] bg-white rounded-2xl shadow-[0_12px_40px_-12px_rgba(0,0,0,0.2)] border border-gray-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200">

                    {/* Header */}
                    <div className="bg-[#006bff] px-5 py-4 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs uppercase tracking-wider">
                                AI
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white leading-tight">1MOBY CRM AI</h3>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition-colors"
                            aria-label="ปิด"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 bg-gray-50/50 p-4 overflow-y-auto flex flex-col gap-3">
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex items-end gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                                {msg.role === "assistant" && (
                                    <div className="w-6 h-6 rounded-full bg-[#006bff] flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold">AI</div>
                                )}
                                <div className={`max-w-[82%] flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                                    <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                                        msg.role === "user"
                                            ? "bg-[#006bff] text-white rounded-br-sm whitespace-pre-wrap"
                                            : "bg-white text-gray-700 border border-gray-100 shadow-sm rounded-bl-sm"
                                    }`}>
                                        {msg.role === "user" ? msg.content : <MarkdownMessage content={msg.content} />}
                                    </div>
                                    {msg.tools_used && msg.tools_used.length > 0 && (
                                        <div className="flex flex-wrap gap-1 px-1">
                                            {[...new Set(msg.tools_used)].map(t => (
                                                <span key={t} className="text-[9px] bg-blue-50 text-blue-500 border border-blue-100 rounded-full px-2 py-0.5 font-medium">
                                                    🔍 {TOOL_LABELS[t] ?? t}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Typing indicator */}
                        {loading && (
                            <div className="flex items-end gap-2">
                                <div className="w-6 h-6 rounded-full bg-[#006bff] flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold">AI</div>
                                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                                    {[0, 0.15, 0.3].map((delay, j) => (
                                        <span key={j} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}s` }} />
                                    ))}
                                </div>
                            </div>
                        )}

                        <div ref={bottomRef} />
                    </div>

                    {/* Quick question chips */}
                    {messages.length <= 1 && (
                        <div className="px-4 py-2 bg-white border-t border-gray-50 flex gap-1.5 overflow-x-auto scrollbar-hide">
                            {EXAMPLE_QUESTIONS.slice(0, 2).map(q => (
                                <button
                                    key={q}
                                    onClick={() => sendMessage(q)}
                                    className="flex-shrink-0 text-[10px] bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-3 py-1 hover:bg-blue-100 transition-colors font-medium"
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
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKey}
                            placeholder="เช่น ลูกค้าคนไหนน่าจะ churn ?"
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-[#006bff] focus:ring-1 focus:ring-[#006bff] transition-all"
                            disabled={loading}
                        />
                        <button
                            onClick={() => sendMessage()}
                            disabled={loading || !input.trim()}
                            className="w-9 h-9 flex items-center justify-center rounded-full bg-[#006bff] text-white flex-shrink-0 hover:bg-[#0052cc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                            aria-label="ส่ง"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 ml-0.5">
                                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* FAB Toggle */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-14 h-14 bg-[#006bff] rounded-full flex items-center justify-center text-white shadow-[0_8px_30px_-6px_rgba(0,107,255,0.5)] hover:bg-[#0052cc] hover:scale-105 active:scale-95 transition-all duration-200"
                aria-label="เปิด/ปิด AI Chat"
            >
                {isOpen ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-6 h-6">
                        <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                        <path d="M5 2h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-3.5l-4.5 4v-4H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zm4 9h2V9H9v2zm4 0h2V9h-2v2zm4 0h2V9h-2v2z" />
                    </svg>
                )}
            </button>
        </div>
    );
}

