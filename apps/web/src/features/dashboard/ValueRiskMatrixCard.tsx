"use client";
import Link from "next/link";
import { formatCompactCurrency } from "@/lib/format";
import type { RunSummary } from "@/lib/mlApi";
import { TEXT_SAFE } from "./palette";

const RISKS = ["low", "medium", "high", "critical"] as const;
const TIERS = ["high", "mid", "low"] as const;

const RISK_LABEL: Record<(typeof RISKS)[number], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};
const TIER_LABEL: Record<(typeof TIERS)[number], string> = {
  high: "High value",
  mid: "Mid value",
  low: "Low value",
};

/** Value × Risk matrix (spec §2.1) — มุม high value × high risk คือกลุ่มที่ต้อง save ก่อน */
export function ValueRiskMatrixCard({ summary, runId }: { summary: RunSummary; runId: string }) {
  const cell = (tier: string, risk: string) =>
    summary.value_risk_matrix.find((c) => c.value_tier === tier && c.risk_level === risk);

  return (
    <section className="surface-elev h-full overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-4 sm:px-5">
        <h2 className={`type-section-title text-[20px] leading-tight ${TEXT_SAFE}`}>
          Value × Risk
        </h2>
        <p className="mt-1 text-[11px] font-normal leading-5 text-[color:var(--ink-4)]">
          เฉพาะ Active Paid · มุมขวาบน = มูลค่าสูง + เสี่ยงสูง ต้องรีบจัดการ · คลิกเพื่อดูรายชื่อ
        </p>
      </div>
      <div className="p-4 sm:p-5">
        <div className="grid min-w-0 grid-cols-[88px_repeat(4,minmax(0,1fr))] gap-1.5">
          <div />
          {RISKS.map((r) => (
            <div key={r} className="type-label text-center">
              {RISK_LABEL[r]}
            </div>
          ))}
          {TIERS.map((tier) => (
            <FragmentRow key={tier} tier={tier} cell={cell} runId={runId} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FragmentRow({
  tier,
  cell,
  runId,
}: {
  tier: (typeof TIERS)[number];
  cell: (t: string, r: string) => RunSummary["value_risk_matrix"][number] | undefined;
  runId: string;
}) {
  return (
    <>
      <div className="type-label flex items-center">
        {TIER_LABEL[tier]}
      </div>
      {RISKS.map((risk) => {
        const c = cell(tier, risk);
        const hot = tier === "high" && (risk === "high" || risk === "critical");
        const warm = (tier === "mid" && (risk === "high" || risk === "critical")) || (tier === "high" && risk === "medium");
        return (
          <Link
            key={risk}
            href={`/customers?run=${runId}&customer_value_tier=${tier}&churn_risk_level=${risk}`}
            title={`CLV รวม ${formatCompactCurrency(c?.clv_sum ?? 0)} ฿`}
            className={`rounded-xl border px-2 py-3 text-center transition-colors hover:border-[color:var(--moby-300)] ${
              hot
                ? "border-[#fecaca] bg-[#fef2f2]"
                : warm
                  ? "border-[#fde68a] bg-[#fffbeb]"
                  : "border-gray-200 bg-white"
            }`}
          >
            <div className={`num text-[18px] leading-none ${hot ? "text-[#b91c1c]" : ""}`}>
              {(c?.count ?? 0).toLocaleString()}
            </div>
            <div className="num mt-1 text-[10.5px] text-[color:var(--ink-5)]">
              {formatCompactCurrency(c?.clv_sum ?? 0)}
            </div>
          </Link>
        );
      })}
    </>
  );
}
