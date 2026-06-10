import type { DashboardOverview } from "@/mocks/dashboard";
import { formatNumber } from "@/lib/format";
import { BRAND_TRACK, LIFECYCLE_PALETTE, TEXT_SAFE } from "./palette";

export function LifecycleMixCard({ overview }: { overview: DashboardOverview }) {
  const lifecycleEntries = Object.entries(overview.lifecycle) as Array<[
    keyof typeof LIFECYCLE_PALETTE,
    number,
  ]>;

  return (
    <section className="surface-elev h-full overflow-hidden">
      <div className="flex min-w-0 items-start justify-between gap-4 border-b border-[color:var(--line-2)] px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 className={`text-[20px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)] ${TEXT_SAFE}`}>
            Customer lifecycle mix
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-[color:var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[color:var(--ink-3)]">
          4 segments
        </span>
      </div>

      <div className="p-4 sm:p-5">
        <div
          className="flex h-3 overflow-hidden rounded-full"
          style={{ background: BRAND_TRACK }}
          aria-label="Lifecycle distribution"
        >
          {lifecycleEntries.map(([stage, count]) => {
            const pct = overview.totals.customers > 0 ? (count / overview.totals.customers) * 100 : 0;
            return (
              <span
                key={stage}
                className="h-full"
                style={{
                  width: `${pct}%`,
                  background: LIFECYCLE_PALETTE[stage],
                }}
              />
            );
          })}
        </div>

        <div className="mt-4 space-y-2">
          {lifecycleEntries.map(([stage, count]) => (
            <LifecycleFact
              key={stage}
              label={stage}
              value={count}
              total={overview.totals.customers}
              color={LIFECYCLE_PALETTE[stage]}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function LifecycleFact({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="min-w-0 rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3">
      <div className="flex min-w-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-5)]">
              {label}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-[20px] font-semibold leading-none text-[color:var(--ink-1)]">
            {formatNumber(value)}
          </div>
          <div className="num mt-1 text-[11px] text-[color:var(--ink-5)]">{pct.toFixed(1)}%</div>
        </div>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full" style={{ background: BRAND_TRACK }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
