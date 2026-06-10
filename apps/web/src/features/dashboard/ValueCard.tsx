import { Gem } from "lucide-react";
import type { DashboardOverview } from "@/mocks/dashboard";
import { formatCurrency } from "@/lib/format";
import { PanelHeader } from "./PanelHeader";
import { RiskListRow } from "./RiskCard";
import {
  BRAND_BLUE_GRADIENT,
  BRAND_BLUE_YELLOW_GRADIENT,
  BRAND_ORANGE_GRADIENT,
  BRAND_YELLOW_GRADIENT,
  TEXT_SAFE,
} from "./palette";

export function ValueCard({ overview }: { overview: DashboardOverview }) {
  const valueData = [
    [
      "High value at risk",
      overview.value.high_value_at_risk,
      "High CLV + high churn risk",
      BRAND_ORANGE_GRADIENT,
    ],
    [
      "High value",
      overview.value.high_value,
      "accounts",
      BRAND_BLUE_GRADIENT,
    ],
    ["Mid value", overview.value.mid_value, "accounts", BRAND_YELLOW_GRADIENT],
    ["Low value", overview.value.low_value, "accounts", BRAND_BLUE_YELLOW_GRADIENT],
  ] as const;

  return (
    <div className="surface-elev flex h-full flex-col overflow-hidden">
      <PanelHeader
        eyebrow="Value"
        title="CLV concentration"
        hint="ใช้ดูว่าความเสี่ยงกระทบลูกค้ากลุ่มมูลค่าสูงแค่ไหน"
        icon={Gem}
      />
      <div className="flex-1 border-t border-[color:var(--line-2)] p-4 sm:p-5">
        <div className="mb-4 rounded-[24px] border border-[color:var(--line)] bg-white p-4 shadow-[var(--shadow-1)]">
          <div className={`text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--moby-700)] ${TEXT_SAFE}`}>Predicted CLV</div>
          <div className="mt-2 flex min-w-0 flex-wrap items-end justify-between gap-3">
            <div className={`num text-[clamp(24px,6vw,28px)] font-semibold tracking-[-0.04em] text-[color:var(--ink-1)] ${TEXT_SAFE}`}>
              {formatCurrency(overview.value.predicted_clv_6m)}
            </div>
            <div className="pb-1 text-right text-[12px] text-[color:var(--ink-4)]">6-month forecast</div>
          </div>
        </div>
        <div className="space-y-3">
          {valueData.map(([label, value, hint, color]) => (
            <div key={label} className="min-w-0 rounded-[24px] border border-[color:var(--line)] bg-white p-4">
              <RiskListRow
                label={label}
                value={value}
                hint={hint}
                color={color}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
