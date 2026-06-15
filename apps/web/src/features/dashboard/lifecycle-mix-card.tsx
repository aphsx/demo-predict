import type { DashboardOverview } from "./types";
import { formatNumber } from "@/lib/format";
import { LIFECYCLE_PALETTE, TEXT_SAFE } from "./palette";

export function LifecycleMixCard({ overview }: { overview: DashboardOverview }) {
  const lifecycleEntries = Object.entries(overview.lifecycle) as Array<[
    keyof typeof LIFECYCLE_PALETTE,
    number,
  ]>;
  const totalCustomers = overview.totals.customers;
  const lifecycleStats = lifecycleEntries.map(([stage, count]) => ({
    stage,
    count,
    pct: totalCustomers > 0 ? (count / totalCustomers) * 100 : 0,
  }));
  const maxPct = Math.max(...lifecycleStats.map((item) => item.pct), 1);
  const chartMaxPct = Math.max(40, Math.ceil(maxPct / 5) * 5);

  return (
    <section className="surface-elev flex h-full flex-col overflow-hidden">
      <div className="flex min-w-0 items-start justify-between gap-4 border-b border-gray-100 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className={`type-section-title text-[20px] leading-tight ${TEXT_SAFE}`}>
            Customer lifecycle
          </h2>
          <div className="mt-2 flex min-w-0 items-baseline gap-1.5">
            <span className="num text-[26px] leading-none text-[color:var(--ink-1)] tabular-nums">
              {formatNumber(totalCustomers)}
            </span>
            <span className="type-muted text-[12px] font-medium leading-none">
              customers
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="type-meta rounded-full bg-gray-50 px-3 py-1 text-[11px] font-normal">
            4 segments
          </span>
          <span className="type-meta rounded-full bg-gray-50 px-3 py-1 text-[11px] font-normal">
            Scale 0-{chartMaxPct}%
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="grid min-w-0 flex-1 grid-cols-[32px_minmax(0,1fr)] gap-3">
          <div className="type-muted grid h-[228px] grid-rows-[auto_1fr_auto] text-right text-[10px] font-normal">
            <span>{chartMaxPct}%</span>
            <span className="self-center">{Math.round(chartMaxPct / 2)}%</span>
            <span>0%</span>
          </div>

          <div className="relative min-w-0" aria-label="Lifecycle distribution vertical bar chart">
            <div className="absolute inset-x-0 top-0 h-px bg-gray-100" />
            <div className="absolute inset-x-0 top-1/2 h-px bg-gray-100" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gray-200" />

            <div className="relative z-10 grid h-[228px] grid-cols-4 items-end gap-3 sm:gap-4">
              {lifecycleStats.map(({ stage, count, pct }) => (
                <div key={stage} className="flex h-full min-w-0 flex-col items-center justify-end">
                  <div className="mb-2 rounded-full bg-gray-50 px-2 py-1 text-center">
                    <div className="num text-[11px] leading-none text-[color:var(--ink-1)] tabular-nums">
                      {formatNumber(count)}
                    </div>
                  </div>
                  <div className="flex h-full w-full items-end justify-center">
                    <div
                      className="w-full max-w-[54px] rounded-t-[18px] shadow-[0_18px_34px_rgba(15,23,42,0.12)]"
                      style={{
                        height: `${(pct / chartMaxPct) * 100}%`,
                        minHeight: pct > 0 ? 12 : 0,
                        background: LIFECYCLE_PALETTE[stage],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-3 sm:gap-4">
          {lifecycleStats.map(({ stage, pct }) => (
            <div key={stage} className="min-w-0 text-center">
              <div className={`type-muted truncate text-[10px] font-normal uppercase tracking-[.08em] ${TEXT_SAFE}`}>
                {stage}
              </div>
              <div className="num mt-1 text-[13px] text-[color:var(--ink-1)] tabular-nums">
                {pct.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
