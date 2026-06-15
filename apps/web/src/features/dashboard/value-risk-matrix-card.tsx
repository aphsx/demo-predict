"use client";

import Link from "next/link";
import { formatCompactCurrency } from "@/lib/format";
import { MOBY_BRAND } from "@/lib/login-brand-colors";
import type { RunSummary } from "@/lib/mlApi";
import { HighValueMedal } from "@/features/customers/customerRowUi";
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

const RISK_COLOR: Record<(typeof RISKS)[number], string> = {
  low: MOBY_BRAND.blue,
  medium: MOBY_BRAND.orangeWarm,
  high: MOBY_BRAND.orange,
  critical: MOBY_BRAND.orange,
};

const TIER_COLOR: Record<(typeof TIERS)[number], string> = {
  high: MOBY_BRAND.blue,
  mid: MOBY_BRAND.orangeWarm,
  low: "#9ca3af",
};

const MATRIX_GRID = "grid-cols-[minmax(108px,120px)_repeat(4,minmax(88px,1fr))]";

function cellCountColor(tier: (typeof TIERS)[number], risk: (typeof RISKS)[number]): string | undefined {
  const hot = tier === "high" && (risk === "high" || risk === "critical");
  const warm =
    (tier === "mid" && (risk === "high" || risk === "critical")) ||
    (tier === "high" && risk === "medium");
  if (hot) return MOBY_BRAND.orange;
  if (warm) return MOBY_BRAND.orangeWarm;
  return undefined;
}

/** Value × Risk matrix (spec §2.1) — มุม high value × high risk คือกลุ่มที่ต้อง save ก่อน */
export function ValueRiskMatrixCard({ summary, runId }: { summary: RunSummary; runId: string }) {
  const cell = (tier: string, risk: string) =>
    summary.value_risk_matrix.find((c) => c.value_tier === tier && c.risk_level === risk);

  return (
    <section className="surface-elev overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-4 sm:px-5">
        <h2 className={`type-section-title text-[20px] leading-tight ${TEXT_SAFE}`}>Value × Risk</h2>
        <p className="mt-0.5 text-[11.5px] text-[color:var(--ink-5)]">
          เฉพาะ Active Paid · มุมขวาบน = มูลค่าสูง + เสี่ยงสูง ต้องรีบจัดการ · คลิกเพื่อดูรายชื่อ
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div
            className={`grid gap-3 border-b border-gray-100 bg-gray-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] ${MATRIX_GRID}`}
          >
            <div />
            {RISKS.map((risk) => (
              <div key={risk} className="flex items-center justify-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: RISK_COLOR[risk] }}
                />
                <span>{RISK_LABEL[risk]}</span>
              </div>
            ))}
          </div>

          <div className="divide-y divide-gray-100">
            {TIERS.map((tier) => (
              <div key={tier} className={`grid items-center gap-3 px-5 py-4 ${MATRIX_GRID}`}>
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: TIER_COLOR[tier] }}
                  />
                  <span className="truncate text-[12px] font-semibold text-[color:var(--ink-2)]">
                    {TIER_LABEL[tier]}
                  </span>
                  {tier === "high" ? <HighValueMedal /> : null}
                </div>
                {RISKS.map((risk) => {
                  const data = cell(tier, risk);
                  const countColor = cellCountColor(tier, risk);

                  return (
                    <Link
                      key={risk}
                      href={`/customers?run=${runId}&customer_value_tier=${tier}&churn_risk_level=${risk}`}
                      title={`CLV รวม ${formatCompactCurrency(data?.clv_sum ?? 0)} ฿`}
                      className="rounded-xl border border-gray-200 bg-white px-2 py-3 text-center transition-colors hover:border-[color:var(--moby-200)] hover:bg-gray-50"
                    >
                      <div
                        className="num text-[18px] font-semibold leading-none text-[color:var(--ink-2)]"
                        style={countColor ? { color: countColor } : undefined}
                      >
                        {(data?.count ?? 0).toLocaleString()}
                      </div>
                      <div className="num mt-1 text-[11.5px] text-[color:var(--ink-5)]">
                        {formatCompactCurrency(data?.clv_sum ?? 0)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
