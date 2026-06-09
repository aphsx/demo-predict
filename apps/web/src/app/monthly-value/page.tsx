"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft, CreditCard, Database, TrendingUp } from "lucide-react";
import { PageHeader, StatusPill } from "@/components/ui";

type MonthlyValuePoint = {
  month: string;
  revenue: number;
  payments: number;
};

const MONTHLY_VALUE: MonthlyValuePoint[] = [
  { month: "2025-07", revenue: 742000, payments: 58 },
  { month: "2025-08", revenue: 786000, payments: 63 },
  { month: "2025-09", revenue: 821000, payments: 66 },
  { month: "2025-10", revenue: 805000, payments: 61 },
  { month: "2025-11", revenue: 864000, payments: 70 },
  { month: "2025-12", revenue: 912000, payments: 74 },
  { month: "2026-01", revenue: 895000, payments: 72 },
  { month: "2026-02", revenue: 936000, payments: 76 },
  { month: "2026-03", revenue: 971000, payments: 81 },
  { month: "2026-04", revenue: 1008000, payments: 83 },
  { month: "2026-05", revenue: 1181000, payments: 90 },
  { month: "2026-06", revenue: 1048000, payments: 84 },
];

export default function MonthlyValuePage() {
  const avgMonthlyValue = average(MONTHLY_VALUE.map((point) => point.revenue));
  const totalValue = MONTHLY_VALUE.reduce((sum, point) => sum + point.revenue, 0);
  const latest = MONTHLY_VALUE[MONTHLY_VALUE.length - 1];
  const first = MONTHLY_VALUE[0];
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
            hint={`${MONTHLY_VALUE.length}-month average from payments`}
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
            <MonthlyValueChart data={MONTHLY_VALUE} />
          </div>
        </section>

        <section className="surface p-4">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[color:var(--ink-5)]">
            <Database size={12} />
            Mock chart data is isolated in `MONTHLY_VALUE`
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
          <div className="num mt-2 text-[30px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)]">
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

function MonthlyValueChart({ data }: { data: MonthlyValuePoint[] }) {
  const width = 920;
  const height = 320;
  const padding = { top: 26, right: 24, bottom: 42, left: 74 };
  const values = data.map((point) => point.revenue);
  const min = Math.min(...values) * 0.94;
  const max = Math.max(...values) * 1.04;
  const range = max - min || 1;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = data.map((point, index) => {
    const x = padding.left + (index / (data.length - 1)) * plotWidth;
    const y = padding.top + plotHeight - ((point.revenue - min) / range) * plotHeight;
    return { ...point, x, y };
  });
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${padding.top + plotHeight} L${points[0].x},${padding.top + plotHeight} Z`;
  const gridValues = [max, min + range * 0.5, min];

  return (
    <div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[760px]">
          <defs>
            <linearGradient id="monthlyValueArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--moby-600)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--moby-600)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridValues.map((value) => {
            const y = padding.top + plotHeight - ((value - min) / range) * plotHeight;
            return (
              <g key={value}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="var(--line-2)"
                  strokeDasharray="5 7"
                />
                <text x={16} y={y + 4} className="fill-[color:var(--ink-5)] text-[11px]">
                  {formatCompactCurrency(value)}
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill="url(#monthlyValueArea)" />
          <path d={linePath} fill="none" stroke="var(--moby-600)" strokeWidth="3" strokeLinecap="round" />

          {points.map((point) => (
            <g key={point.month}>
              <circle cx={point.x} cy={point.y} r="4.5" fill="white" stroke="var(--moby-600)" strokeWidth="3" />
              <text
                x={point.x}
                y={height - 15}
                textAnchor="middle"
                className="fill-[color:var(--ink-5)] text-[10px]"
              >
                {formatMonth(point.month)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {data.slice(-4).map((point) => (
          <div key={point.month} className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-5)]">
              {point.month}
            </div>
            <div className="num mt-1 text-[20px] font-semibold text-[color:var(--ink-1)]">
              {formatCurrency(point.revenue)}
            </div>
            <div className="mt-1 text-[11px] text-[color:var(--ink-5)]">
              {point.payments} payments
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ฿`;
  return `${Math.round(value).toLocaleString()} ฿`;
}

function formatCompactCurrency(value: number): string {
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function formatMonth(month: string): string {
  const [, monthNumber] = month.split("-");
  return monthNumber;
}
