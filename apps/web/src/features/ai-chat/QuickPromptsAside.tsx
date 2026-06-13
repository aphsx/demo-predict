"use client";

import Link from "next/link";
import { ChevronRight, TrendingUp, Users, AlertTriangle } from "lucide-react";

const TEXT_WRAP = "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

const QUICK_PROMPTS = [
  { icon: TrendingUp, label: "วิเคราะห์ churn risk ของพอร์ต" },
  { icon: Users, label: "สรุป lifecycle distribution" },
  { icon: AlertTriangle, label: "บัญชีที่มีความเสี่ยงสูงสุด" },
];

export function QuickPromptsAside({
  showQuick,
  onPrompt,
}: {
  showQuick: boolean;
  onPrompt: (label: string) => void;
}) {
  return (
    <aside className="hidden min-h-0 w-[240px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-gray-200 p-5 xl:flex">
      {showQuick && (
        <div>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
            ตัวอย่างคำถาม
          </p>
          <div className="space-y-2.5">
            {QUICK_PROMPTS.map(({ label }) => (
              <button
                key={label}
                onClick={() => onPrompt(label)}
                className={`block w-full text-left text-[12px] leading-5 text-[color:var(--ink-3)]
                  transition-colors hover:text-[color:var(--moby-600)] ${TEXT_WRAP}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] mb-3">ลิงก์ด่วน</p>
        <div className="space-y-1">
          {[
            { href: "/customers", label: "Customers" },
            { href: "/model-performance", label: "Model Health" },
          ].map(({ href, label }) => (
            <Link key={href} href={href}
              className="flex min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px]
                text-[color:var(--ink-3)] hover:bg-gray-50 hover:text-[color:var(--ink-1)] transition-colors group">
              <ChevronRight size={12} className="text-[color:var(--ink-5)] group-hover:text-[color:var(--moby-600)]" />
              <span className={TEXT_WRAP}>{label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] mb-3">เมื่อ API พร้อม</p>
        <ul className="space-y-2.5">
          {[
            "วิเคราะห์ churn risk",
            "คำนวณ CLV",
            "ติดตาม lifecycle",
            "ตรวจ model drift",
          ].map(cap => (
            <li key={cap} className="flex min-w-0 items-start gap-2 text-[11.5px] text-[color:var(--ink-3)]">
              <span className="w-1 h-1 rounded-full bg-[color:var(--moby-500)] mt-1.5 shrink-0" />
              <span className={TEXT_WRAP}>{cap}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-gray-200 pt-4 mt-auto">
        <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-[11px] font-semibold text-[color:var(--moby-600)] mb-1">Real insights only</p>
          <p className={`text-[10.5px] text-[color:var(--ink-4)] leading-relaxed ${TEXT_WRAP}`}>
            ไม่มี fallback เป็นข้อมูลจำลอง หาก backend ยังไม่พร้อมจะแสดงสถานะรอเชื่อมต่อ
          </p>
        </div>
      </div>
    </aside>
  );
}
