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
        <div className="relative flex flex-col flex-1 w-full max-w-6xl mx-auto overflow-hidden rounded-[20px] bg-white border border-gray-200 shadow-[0_4px_20px_rgba(0,0,0,0.05)] min-h-[600px]">
            {/* Background Effects */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-[20px]">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#006bff]/5 blur-[100px] rounded-full animate-pulse opacity-50 transition-all duration-[5000ms]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#fc4c02]/5 blur-[100px] rounded-full animate-pulse opacity-50 transition-all duration-[7000ms]" />
                <div
                    className="absolute inset-0 opacity-[0.4]"
                    style={{
                        backgroundImage: "radial-gradient(circle at center, #f0f0f0 1px, transparent 1px)",
                        backgroundSize: "24px 24px"
                    }}
                />
            </div>

            {/* Header */}
            <header className="relative z-10 flex items-center justify-between px-6 sm:px-8 py-5 border-b border-gray-100 bg-white/80 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                    <div className="relative flex h-12 w-12 items-center justify-center rounded-[10px] bg-[#e6f0ff] border border-[#006bff]/20 shadow-[0_4px_10px_rgba(0,107,255,0.1)] overflow-hidden">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-[#006bff] relative z-10">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                        </svg>
                        <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] z-20" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-gray-900 tracking-tight">One Move Intelligence</h1>
                        <p className="text-sm text-[#006bff] font-medium">Enterprise AI Assistant Active</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button className="p-2.5 rounded-[10px] bg-white border border-gray-200 text-gray-500 hover:text-[#006bff] hover:border-[#006bff] transition-all">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* Chat Area */}
            <div className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 scroll-smooth" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                <div className="flex flex-col space-y-6 max-w-4xl mx-auto w-full">
                    {messages.map((msg, index) => (
                        <div
                            key={msg.id}
                            className={clsx(
                                "flex w-full group animate-in fade-in slide-in-from-bottom-2 duration-300",
                                msg.role === "user" ? "justify-end" : "justify-start"
                            )}
                            style={{ animationFillMode: "both", animationDelay: `${index * 50}ms` }}
                        >
                            <div className="flex flex-col gap-1.5 max-w-[85%] sm:max-w-[75%]">
                                <div className={clsx("flex items-end gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>

                                    {/* AI Avatar for AI messages */}
                                    {msg.role === "ai" && (
                                        <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#e6f0ff] border border-[#006bff]/20 text-[#006bff]">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-[#006bff]">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                                            </svg>
                                        </div>
                                    )}

                                    <div
                                        className={clsx(
                                            "relative px-5 py-3.5 text-[15px] leading-relaxed shadow-sm transition-all",
                                            msg.role === "user"
                                                ? "text-white bg-[#006bff] rounded-[20px] rounded-tr-[4px] shadow-[#006bff]/20 shadow-lg"
                                                : "text-gray-800 bg-white border border-gray-100 rounded-[20px] rounded-tl-[4px]"
                                        )}
                                    >
                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                </div>
                                <span className={clsx("text-xs font-medium text-gray-500 px-1", msg.role === "user" ? "text-right" : "text-left ml-12")}>
                                    {msg.timestamp}
                                </span>
                            </div>
                        </div>
                    ))}

                    {isTyping && (
                        <div className="flex w-full justify-start animate-in fade-in duration-300">
                            <div className="flex gap-3 max-w-[85%] sm:max-w-[75%]">
                                <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#e6f0ff] border border-[#006bff]/20 text-[#006bff]">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-[#006bff]">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                                    </svg>
                                </div>
                                <div className="px-5 py-4 bg-white border border-gray-100 rounded-[20px] rounded-tl-[4px] flex items-center gap-1.5 h-[52px]">
                                    <div className="w-2 h-2 rounded-full bg-[#006bff] animate-bounce" style={{ animationDelay: "0ms" }} />
                                    <div className="w-2 h-2 rounded-full bg-[#006bff] animate-bounce" style={{ animationDelay: "150ms" }} />
                                    <div className="w-2 h-2 rounded-full bg-[#006bff] animate-bounce" style={{ animationDelay: "300ms" }} />
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} className="h-2" />
                </div>
            </div>

            {/* Input Area */}
            <div className="relative z-20 w-full max-w-4xl mx-auto px-4 pb-6 pt-2">
                {messages.length <= 2 && !isTyping && (
                    <div className="mb-4 flex flex-wrap gap-2.5 justify-center sm:justify-start">
                        {SUGGESTIONS.map((sug, i) => (
                            <button
                                key={i}
                                onClick={() => handleSend(undefined, sug)}
                                className="px-4 py-2 text-[13px] font-medium text-gray-500 transition-all rounded-full overflow-hidden hover:text-[#006bff] bg-white border border-gray-200 hover:border-[#006bff]"
                            >
                                <span className="relative z-10">{sug}</span>
                            </button>
                        ))}
                    </div>
                )}

                <div className="relative group rounded-[20px] bg-white border border-gray-200 shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all hover:border-[#006bff]/50 focus-within:border-[#006bff] focus-within:shadow-[0_4px_20px_rgba(0,107,255,0.1)]">
                    <form onSubmit={handleSend} className="flex items-end gap-2 p-2">
                        <button type="button" className="p-3 text-gray-400 hover:text-[#006bff] transition-colors rounded-[10px] hover:bg-gray-50 shrink-0">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm3.65 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75z" />
                            </svg>
                        </button>

                        <button type="button" className="p-3 text-gray-400 hover:text-[#006bff] transition-colors rounded-[10px] hover:bg-gray-50 shrink-0 hidden sm:block">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
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
                            placeholder="พิมพ์ข้อความที่ต้องการสอบถาม..."
                            className="flex-1 max-h-32 min-h-[52px] bg-transparent border-none resize-none focus:outline-none text-gray-800 placeholder:text-gray-400 py-3.5 text-[15px] leading-relaxed"
                            rows={1}
                            style={{ scrollbarWidth: "none" }}
                        />

                        <button
                            type="submit"
                            disabled={!input.trim()}
                            className={clsx(
                                "p-3.5 rounded-[10px] transition-all duration-200 shrink-0 mb-0.5",
                                input.trim()
                                    ? "bg-[#006bff] text-white shadow-lg shadow-[#006bff]/25 hover:bg-[#0056cc] hover:scale-105 active:scale-95"
                                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                            )}
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                            </svg>
                        </button>
                    </form>
                </div>

                <div className="text-center mt-4">
                    <p className="text-[11px] font-medium text-gray-500/80">
                        One Move GenAI might occasionally make mistakes. Verify important information.
                    </p>
                </div>
            </div>
        </div>
    );
}
