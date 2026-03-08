"use client";

import { useState } from "react";

export default function FloatingChat() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            {/* Chat Window */}
            {isOpen && (
                <div className="mb-4 w-[340px] h-[480px] bg-white rounded-2xl shadow-[0_12px_40px_-12px_rgba(0,0,0,0.15)] border border-gray-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200">
                    {/* Header */}
                    <div className="bg-[#006bff] px-5 py-4 flex items-center justify-between shadow-sm relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs uppercase tracking-wider backdrop-blur-sm">
                                1M
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white leading-tight">1MOBY Support</h3>
                                <p className="text-[10px] text-blue-100 font-medium tracking-wide">Usually replies instantly</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-white/80 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-full"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 bg-gray-50/50 p-4 overflow-y-auto flex flex-col gap-3">
                        <div className="flex justify-center mb-2">
                            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Today</span>
                        </div>

                        <div className="self-start max-w-[85%] flex items-end gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#006bff] flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold">1M</div>
                            <div className="bg-white px-4 py-2.5 rounded-2xl rounded-bl-sm border border-gray-100 shadow-sm text-sm text-gray-700 font-medium">
                                สวัสดีครับ มีอะไรให้เราช่วยเหลือเกี่ยวกับการใช้งาน Dashboard ไหมครับ?
                            </div>
                        </div>
                    </div>

                    {/* Input Area */}
                    <div className="bg-white px-4 py-3 border-t border-gray-100 flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="พิมพ์ข้อความที่นี่..."
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-[#006bff] focus:ring-1 focus:ring-[#006bff] transition-all"
                        />
                        <button className="w-9 h-9 flex items-center justify-center rounded-full bg-[#006bff] text-white flex-shrink-0 hover:bg-[#0052cc] transition-colors shadow-sm">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 ml-0.5">
                                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Floating Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-14 h-14 bg-[#006bff] rounded-full flex items-center justify-center text-white shadow-[0_8px_30px_-6px_rgba(0,107,255,0.5)] hover:bg-[#0052cc] hover:scale-105 active:scale-95 transition-all duration-200"
            >
                {isOpen ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-6 h-6 animate-in fade-in zoom-in duration-200">
                        <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 animate-in fade-in zoom-in duration-200">
                        <path d="M5 2h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-3.5l-4.5 4v-4H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zm4 9h2V9H9v2zm4 0h2V9h-2v2zm4 0h2V9h-2v2z" />
                    </svg>
                )}
            </button>
        </div>
    );
}
