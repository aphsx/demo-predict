import { CreditCard } from "lucide-react";
import type { DashboardOverview } from "@/mocks/dashboard";
import { formatCredits, formatNumber } from "@/lib/format";
import { PanelHeader } from "./PanelHeader";
import { RiskListRow } from "./RiskCard";
import { CREDIT_PALETTE, TEXT_SAFE } from "./palette";

export function CreditUrgencyCard({ overview }: { overview: DashboardOverview }) {
  const creditData = [
    ["Critical", overview.credit.critical],
    ["Warning", overview.credit.warning],
    ["Monitor", overview.credit.monitor],
    ["Stable", overview.credit.stable],
  ] as const;

  return (
    <div className="surface-elev flex h-full flex-col overflow-hidden">
      <PanelHeader
        eyebrow="Credit"
        title="Top-up urgency"
        hint="เฉพาะ active customers ที่ forecast credit ได้"
        icon={CreditCard}
      />
      <div className="flex-1 border-t border-gray-100 p-4 sm:p-5">
        <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-[inset_0_1px_4px_rgba(0,0,0,0.04)]">
          <div className={`text-[11px] font-normal text-[color:var(--warn)] ${TEXT_SAFE}`}>
            Next top-up 7d
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-end justify-between gap-3">
            <div className="num text-[24px] leading-none text-[color:var(--ink-1)] tabular-nums">
              {formatNumber(overview.credit.next_topup_7d)}
            </div>
            <div className="min-w-0 pb-1 text-right">
              <div className="type-label !text-[10px]">
                30d usage
              </div>
              <div className={`num mt-1 text-[12px] text-[color:var(--ink-1)] tabular-nums ${TEXT_SAFE}`}>
                {formatCredits(overview.credit.predicted_usage_30d)}
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {creditData.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-2xl border border-gray-100 bg-white p-4">
              <RiskListRow
                label={label}
                value={value}
                total={overview.active_churn.base_customers}
                totalLabel="active"
                color={CREDIT_PALETTE[label as keyof typeof CREDIT_PALETTE]}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
