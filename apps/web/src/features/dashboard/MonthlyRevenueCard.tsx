import { TrendingUp } from "lucide-react";
import { StatusPill } from "@/components/ui";
import { MonthlyRevenueChart } from "@/components/charts/MonthlyRevenueChart";
import { formatCurrency } from "@/lib/format";
import { MOBY_BRAND } from "@/lib/login-brand-colors";
import type { MonthlyRevenuePoint } from "@/mocks/monthly-revenue";
import { revenueBandColor, TEXT_SAFE } from "./palette";

export function MonthlyRevenueCard({ data }: { data: MonthlyRevenuePoint[] }) {
  const latest = data[data.length - 1];
  const first = data[0];
  const trendPct = first.revenue > 0 ? ((latest.revenue - first.revenue) / first.revenue) * 100 : 0;
  const values = data.map((point) => point.revenue);
  const colorMin = Math.min(...values);
  const colorMax = Math.max(...values);

  return (
    <section className="surface-elev min-w-0 overflow-hidden">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
              Monthly revenue
            </p>
            <StatusPill tone={trendPct >= 0 ? "ok" : "warn"} dot={false}>
              {trendPct >= 0 ? "+" : ""}
              {trendPct.toFixed(1)}% vs first month
            </StatusPill>
          </div>
          <h2 className={`mt-1 text-[20px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)] ${TEXT_SAFE}`}>
            รายได้รายเดือนจนถึงข้อมูลล่าสุด
          </h2>
        </div>
        <div className="w-full rounded-[22px] border border-[color:var(--line)] bg-[color:var(--surface-2)] px-4 py-3 text-right sm:w-auto">
          <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
            Latest
          </div>
          <div className="num mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[color:var(--ink-1)]">
            {formatCurrency(latest.revenue)}
          </div>
          <div className="mt-1 text-[11px] text-[color:var(--ink-5)]">
            {latest.month} · {latest.payments} payments
          </div>
        </div>
      </header>
      <div className="border-t border-[color:var(--line-2)] p-4 sm:p-5">
        <div className="grid min-w-0 grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_220px]">
          <MonthlyRevenueChart
            data={data}
            gradientId="dashboardMonthlyRevenueArea"
            areaColor={MOBY_BRAND.orangeWarm}
            bandColor={revenueBandColor}
            hint="Focus ล่าสุดประมาณ 6 เดือน · เลื่อนซ้ายเพื่อดูเดือนก่อนหน้า"
          />

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3 2xl:grid-cols-1">
            {data.slice(-3).map((point) => (
              <div key={point.month} className="min-w-0 rounded-[24px] border border-[color:var(--line)] bg-white p-4">
                <div className="flex min-w-0 items-center gap-2">
                  <TrendingUp size={13} style={{ color: revenueBandColor(point.revenue, colorMin, colorMax) }} />
                  <div className={`text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-5)] ${TEXT_SAFE}`}>
                    {point.month}
                  </div>
                </div>
                <div className={`num mt-2 text-[20px] font-semibold text-[color:var(--ink-1)] ${TEXT_SAFE}`}>
                  {formatCurrency(point.revenue)}
                </div>
                <div className="mt-1 text-[11px] text-[color:var(--ink-5)]">
                  {point.payments} payments
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
