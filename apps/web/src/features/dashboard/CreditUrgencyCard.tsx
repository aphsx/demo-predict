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
      <div className="flex-1 border-t border-[color:var(--line-2)] p-4 sm:p-5">
        <div className="mb-4 rounded-[24px] border border-[color:var(--line)] bg-white p-4 shadow-[var(--shadow-1)]">
          <div className={`text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--warn)] ${TEXT_SAFE}`}>
            Next top-up 7d
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-end justify-between gap-3">
            <div className="num text-[30px] font-semibold tracking-[-0.04em] text-[color:var(--ink-1)]">
              {formatNumber(overview.credit.next_topup_7d)}
            </div>
            <div className="min-w-0 pb-1 text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-5)]">
                30d usage
              </div>
              <div className={`num mt-1 text-[12px] font-semibold text-[color:var(--ink-2)] ${TEXT_SAFE}`}>
                {formatCredits(overview.credit.predicted_usage_30d)}
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {creditData.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-[24px] border border-[color:var(--line)] bg-white p-4">
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
