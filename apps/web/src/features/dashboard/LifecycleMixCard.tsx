import type { DashboardOverview } from "@/mocks/dashboard";
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
      <div className="flex min-w-0 items-start justify-between gap-4 border-b border-[color:var(--line-2)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className={`text-[20px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)] ${TEXT_SAFE}`}>
            Customer lifecycle mix
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-[color:var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[color:var(--ink-3)]">
          4 segments
        </span>
      </div>

      <div className="flex flex-1 p-3 sm:p-4">
        <div className="flex flex-1 flex-col rounded-[24px] border border-[color:var(--line)] bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.04)] sm:p-4">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)] ${TEXT_SAFE}`}>
                Lifecycle distribution
              </p>
              <div className="num mt-1 text-[26px] font-semibold leading-none tracking-[-0.04em] text-[color:var(--ink-1)]">
                {formatNumber(totalCustomers)}
              </div>
              <p className="mt-1 text-[11px] text-[color:var(--ink-5)]">total customers</p>
            </div>
            <div className="rounded-2xl bg-[color:var(--surface-2)] px-3 py-1.5 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
                Scale
              </div>
              <div className="num mt-1 text-[16px] font-semibold text-[color:var(--ink-2)]">
                0-{chartMaxPct}%
              </div>
            </div>
          </div>

          <div className="mt-4 grid min-w-0 flex-1 grid-cols-[32px_minmax(0,1fr)] gap-3">
            <div className="grid h-[228px] grid-rows-[auto_1fr_auto] text-right text-[10px] font-semibold text-[color:var(--ink-5)]">
              <span>{chartMaxPct}%</span>
              <span className="self-center">{Math.round(chartMaxPct / 2)}%</span>
              <span>0%</span>
            </div>

            <div className="relative min-w-0" aria-label="Lifecycle distribution vertical bar chart">
              <div className="absolute inset-x-0 top-0 h-px bg-[color:var(--line-2)]" />
              <div className="absolute inset-x-0 top-1/2 h-px bg-[color:var(--line-2)]" />
              <div className="absolute inset-x-0 bottom-0 h-px bg-[color:var(--line)]" />

              <div className="relative z-10 grid h-[228px] grid-cols-4 items-end gap-3 sm:gap-4">
                {lifecycleStats.map(({ stage, count, pct }) => (
                  <div key={stage} className="flex h-full min-w-0 flex-col items-center justify-end">
                    <div className="mb-2 rounded-full bg-[color:var(--surface-2)] px-2 py-1 text-center">
                      <div className="num text-[11px] font-semibold leading-none text-[color:var(--ink-1)]">
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
                <div className={`truncate text-[10px] font-semibold uppercase tracking-[.08em] text-[color:var(--ink-5)] ${TEXT_SAFE}`}>
                  {stage}
                </div>
                <div className="num mt-1 text-[13px] font-semibold text-[color:var(--ink-2)]">
                  {pct.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
