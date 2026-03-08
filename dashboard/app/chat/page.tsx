"use client";
import React, { useState, useRef, useEffect } from "react";
import clsx from "clsx";

interface Message {
    id: string;
    role: "user" | "ai";
    content: string;
    timestamp: string;
}

const INITIAL_MESSAGES: Message[] = [
    {
        id: "1",
        role: "ai",
        content: "สวัสดีครับ ทีม One Move ยินดีให้บริการ วันนี้มีข้อมูลลูกค้ารายใดให้ผมช่วยดูแลเป็นพิเศษ หรืออยากให้วิเคราะห์เจาะลึกที่จุดไหนบ้างครับ?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
];

const SUGGESTIONS = [
    "สรุปแนวโน้มการยกเลิกบริการเดือนนี้",
    "ลูกค้ารายใดมีความเสี่ยงสูงสุด?",
    "อธิบายปัจจัยที่ทำให้ลูกค้า Churn",
    "สร้างรายงานสรุปประจำสัปดาห์",
];

export default function ChatbotPage() {
    const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleSend = (e?: React.FormEvent, presetMessage?: string) => {
        if (e) e.preventDefault();
        const text = presetMessage || input;
        if (!text.trim()) return;

        const newUserMsg: Message = {
            id: Date.now().toString(),
            role: "user",
            content: text,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };

        setMessages((prev) => [...prev, newUserMsg]);
        setInput("");
        setIsTyping(true);

        // Mock AI response
        setTimeout(() => {
            const newAiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "ai",
                content: "รับทราบครับ ข้อมูลนี้กำลังถูกประมวลผลผ่าน One Move Engine... เนื่องจากหน้าแชทบอทนี้ยังเป็นเพียง UI สำหรับทดสอบการแสดงผล ระบบจึงยังไม่ได้เชื่อมต่อกับฐานข้อมูลจริงครับ",
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            };
            setMessages((prev) => [...prev, newAiMsg]);
            setIsTyping(false);
        }, 1500);
    };

    return (
        <div className="glass glass-strong relative flex min-h-[600px] h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-2xl">
            {/* Background Dots Pattern (Matching Hero Section) */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.04]"
                style={{
                    backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
                    backgroundSize: "28px 28px",
                }}
            />
            {/* Glowing orbs */}
            <div className="pointer-events-none absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#38BDF8]/10 blur-[120px] rounded-full" />
            <div className="pointer-events-none absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#1461F0]/10 blur-[120px] rounded-full" />

            {/* Header */}
            <div className="relative flex items-center justify-between border-b px-6 py-5" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(11,25,55,0.4)", backdropFilter: "blur(12px)" }}>
                <div className="flex items-center gap-4">
                    <div className="relative flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, rgba(20,97,240,0.2), rgba(56,189,248,0.2))", border: "1px solid rgba(56,189,248,0.3)" }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6 text-[#38BDF8]">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                        </svg>
                        <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-[#0B1937] bg-emerald-400 animate-pulse" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-white">One Move Assistant</h1>
                        <p className="text-xs font-medium uppercase tracking-wider text-[#38BDF8]">Enterprise AI Intelligence</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.38em]" style={{ background: "rgba(56,189,248,0.15)", color: "#38BDF8", border: "1px solid rgba(56,189,248,0.25)" }}>
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                        Online
                    </span>
                </div>
            </div>

            {/* Chat Area */}
            <div className="relative flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
                {messages.map((msg) => (
                    <div key={msg.id} className={clsx("flex w-full box-border", msg.role === "user" ? "justify-end" : "justify-start")}>
                        <div
                            className={clsx(
                                "max-w-[80%] rounded-2xl px-5 py-4 shadow-xl relative",
                                msg.role === "user" ? "text-white rounded-tr-sm" : "text-slate-200 rounded-tl-sm"
                            )}
                            style={
                                msg.role === "user"
                                    ? { background: "linear-gradient(135deg, #1461F0 0%, #2B72FF 100%)", boxShadow: "0 4px 18px rgba(20, 97, 240, 0.25)" }
                                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }
                            }
                        >
                            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            <div
                                className={clsx("text-[10px] mt-2 font-medium opacity-60", msg.role === "user" ? "text-right text-[#C8DEFF]" : "text-left text-slate-400")}
                            >
                                {msg.timestamp}
                            </div>
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div className="flex w-full justify-start">
                        <div
                            className="rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-2 shadow-xl"
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}
                        >
                            <div className="w-2 h-2 rounded-full bg-[#38BDF8] animate-bounce" style={{ animationDelay: "0ms" }} />
                            <div className="w-2 h-2 rounded-full bg-[#38BDF8] animate-bounce" style={{ animationDelay: "150ms" }} />
                            <div className="w-2 h-2 rounded-full bg-[#38BDF8] animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input Area */}
            <div className="relative mt-auto border-t bg-black/20 p-4 shrink-0 transition-all backdrop-blur-md" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                {/* Suggestions */}
                {messages.length <= 2 && !isTyping && (
                    <div className="mb-4 flex flex-wrap gap-2 px-1">
                        {SUGGESTIONS.map((sug, i) => (
                            <button
                                key={i}
                                onClick={() => handleSend(undefined, sug)}
                                className="px-4 py-2 text-xs font-semibold text-[#C8DEFF] transition-all whitespace-nowrap rounded-full hover:scale-[1.02]"
                                style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)" }}
                            >
                                {sug}
                            </button>
                        ))}
                    </div>
                )}

                <form onSubmit={handleSend} className="flex items-end gap-3 rounded-2xl p-2 transition-all shadow-inner" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <button type="button" className="p-3 text-slate-400 hover:text-[#38BDF8] transition-colors rounded-xl hover:bg-white/5">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                        </svg>
                    </button>

                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="พิมพ์ข้อความวิเคราะห์ลูกค้า หรือกดเลือกจากคำแนะนำ..."
                        className="flex-1 max-h-32 min-h-[44px] bg-transparent border-none resize-none focus:outline-none text-slate-100 placeholder:text-slate-500 py-3 text-[15px]"
                        rows={1}
                        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}
                    />

                    <button
                        type="submit"
                        disabled={!input.trim()}
                        className="p-3 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all mb-0.5 hover:-translate-y-0.5"
                        style={{
                            background: input.trim() ? "linear-gradient(135deg, #1461F0, #38BDF8)" : "rgba(255,255,255,0.1)",
                            boxShadow: input.trim() ? "0 4px 18px rgba(20, 97, 240, 0.35)" : "none",
                        }}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 translate-x-[1px] translate-y-[-1px]">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </form>
                <div className="text-center mt-3">
                    <p className="text-[10px] uppercase font-semibold tracking-widest text-slate-500/70">
                        AI Generated Content — Always verify customer risk outputs
                    </p>
                </div>
            </div>
        </div>
    );
}
