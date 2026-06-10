import { TrendingDown } from "lucide-react";
import type { DashboardOverview } from "@/mocks/dashboard";
import { formatNumber } from "@/lib/format";
import { PanelHeader } from "./PanelHeader";
import { CHURN_PALETTE, TEXT_SAFE } from "./palette";

export function RiskCard({ overview }: { overview: DashboardOverview }) {
  const churnData = [
    ["High", overview.active_churn.high],
    ["Medium", overview.active_churn.medium],
    ["Low", overview.active_churn.low],
  ] as const;
  const highPct = (overview.active_churn.high / overview.active_churn.base_customers) * 100;

  return (
    <div className="surface-elev flex h-full flex-col overflow-hidden">
      <PanelHeader
        eyebrow="Churn"
        title="Active customer risk"
        hint="ไม่นับ churned และ ghost เพื่อไม่ให้ตัวเลข churn active ปน lifecycle อื่น"
        icon={TrendingDown}
      />
      <div className="flex-1 border-t border-[color:var(--line-2)] p-4 sm:p-5">
        <div className="mb-4 rounded-[24px] border border-[color:var(--line)] bg-white p-4 shadow-[var(--shadow-1)]">
          <div className={`text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--danger)] ${TEXT_SAFE}`}>
            High-risk active
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-end justify-between gap-3">
            <div className="num text-[34px] font-semibold tracking-[-0.04em] text-[color:var(--danger)]">
              {formatNumber(overview.active_churn.high)}
            </div>
            <div className="num pb-1 text-right text-[12px] text-[color:var(--ink-4)]">
              {highPct.toFixed(1)}% of active customers
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {churnData.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-[24px] border border-[color:var(--line)] bg-white p-4">
              <RiskListRow
                label={label}
                value={value}
                total={overview.active_churn.base_customers}
                totalLabel="active"
                color={CHURN_PALETTE[label as keyof typeof CHURN_PALETTE]}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RiskListRow({
  label,
  value,
  total,
  totalLabel,
  hint,
  color,
}: {
  label: string;
  value: number;
  total?: number;
  totalLabel?: string;
  hint?: string;
  color: string;
}) {
  const pct = total && total > 0 ? (value / total) * 100 : null;

  return (
    <div className="flex min-w-0 items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-2)]">
            {label}
          </div>
          <div className={`num mt-1 text-[11px] text-[color:var(--ink-5)] ${TEXT_SAFE}`}>
            {pct !== null ? `${pct.toFixed(1)}% of ${totalLabel ?? "total"}` : hint}
          </div>
        </div>
      </div>
      <div className="num text-[22px] font-semibold text-[color:var(--ink-1)]">
        {formatNumber(value)}
      </div>
    </div>
  );
}
