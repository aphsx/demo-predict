"use client";

import Link from "next/link";
import { ArrowLeft, CreditCard, Database, TrendingUp } from "lucide-react";
import { PageHeader, StatusPill } from "@/components/ui";
import { MonthlyRevenueChart } from "@/components/charts/MonthlyRevenueChart";
import { formatCurrency } from "@/lib/format";
import type { MonthlyRevenuePoint } from "@/mocks/monthly-revenue";

export function MonthlyValueView({ data }: { data: MonthlyRevenuePoint[] }) {
  const avgMonthlyValue = average(data.map((point) => point.revenue));
  const totalValue = data.reduce((sum, point) => sum + point.revenue, 0);
  const latest = data[data.length - 1];
  const first = data[0];
  const trendPct = ((latest.revenue - first.revenue) / first.revenue) * 100;

  return (
    <main className="pb-12">
      <PageHeader
        eyebrow="Payment value"
        title="Monthly Value Trend"
        actions={
          <Link
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[color:var(--line)] bg-white px-4 text-[12px] font-semibold text-[color:var(--ink-2)]"
          >
            <ArrowLeft size={13} /> Dashboard
          </Link>
        }
      />

      <div className="px-8 mt-4 space-y-5">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SummaryCard
            icon={CreditCard}
            label="Avg monthly value"
            value={formatCurrency(avgMonthlyValue)}
            hint={`${data.length}-month average from payments`}
          />
          <SummaryCard
            icon={TrendingUp}
            label="Latest month"
            value={formatCurrency(latest.revenue)}
            hint={`${latest.month} · ${latest.payments} payments`}
          />
          <SummaryCard
            icon={Database}
            label="Historical value"
            value={formatCurrency(totalValue)}
            hint="sum of visible monthly payment amount"
          />
        </section>

        <section className="surface-elev overflow-hidden">
          <header className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
                  Monthly value
                </p>
                <StatusPill tone={trendPct >= 0 ? "ok" : "warn"} dot={false}>
                  {trendPct >= 0 ? "+" : ""}{trendPct.toFixed(1)}% vs first month
                </StatusPill>
              </div>
              <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-[color:var(--ink-1)]">
                มูลค่ารายเดือนย้อนหลัง
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-[color:var(--ink-4)]">
                Production source: group `Backend_payment.amount` by `payment_date` month.
              </p>
            </div>
          </header>

          <div className="border-t border-[color:var(--line-2)] p-5">
            <MonthlyRevenueChart
              data={data}
              gradientId="monthlyValueArea"
              areaColor="var(--moby-600)"
              bandColor={() => "var(--moby-600)"}
            />

            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              {data.slice(-4).map((point) => (
                <div key={point.month} className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-5)]">
                    {point.month}
                  </div>
                  <div className="num mt-1 text-[20px] font-semibold">
                    {formatCurrency(point.revenue)}
                  </div>
                  <div className="mt-1 text-[11px] text-[color:var(--ink-5)]">
                    {point.payments} payments
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="surface p-4">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[color:var(--ink-5)]">
            <Database size={12} />
            Mock chart data is isolated in `src/mocks/monthly-revenue.ts`
            <span className="opacity-50">·</span>
            API-ready shape: month / revenue / payments
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof CreditCard;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <section className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-5)]">
            {label}
          </div>
          <div className="num mt-2 text-[30px] font-semibold tracking-[-0.035em]">
            {value}
          </div>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[color:var(--moby-50)] text-[color:var(--moby-600)]">
          <Icon size={17} />
        </span>
      </div>
      <div className="mt-3 text-[11.5px] text-[color:var(--ink-5)]">{hint}</div>
    </section>
  );
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
