"use client";

import { useEffect, useRef } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { formatCredits, formatMonth } from "@/lib/format";
import { MOBY_BRAND } from "@/lib/login-brand-colors";
import type { MonthlyRevenuePoint } from "@/mocks/monthly-revenue";
import { TEXT_SAFE } from "./palette";

const SMS_COLOR = MOBY_BRAND.blue;
const EMAIL_COLOR = MOBY_BRAND.orange;
const FOCUSED_MONTHS = 6;

export function MonthlyRevenueCard({ data }: { data: MonthlyRevenuePoint[] }) {
  const latest = data[data.length - 1];
  const latestTotal = latest.sms_usage + latest.email_usage;
  const usageValues = data.flatMap((point) => [point.sms_usage, point.email_usage]);
  const maxUsage = Math.max(...usageValues);
  const minUsage = Math.min(...usageValues);
  const chartMaxUsage = Math.ceil(maxUsage / 100_000) * 100_000;
  const chartMinUsage = Math.max(0, Math.floor(minUsage / 100_000) * 100_000);

  return (
    <section className="surface-elev flex h-full min-w-0 flex-col overflow-hidden">
      <header className="flex min-w-0 items-start justify-between gap-4 border-b border-[color:var(--line-2)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className={`text-[20px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)] ${TEXT_SAFE}`}>
            SMS / Email usage trend
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-[color:var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[color:var(--ink-3)]">
          2 channels
        </span>
      </header>

      <div className="flex flex-1 p-3 sm:p-4">
        <div className="flex min-w-0 flex-1 flex-col rounded-[24px] border border-[color:var(--line)] bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.04)] sm:p-4">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)] ${TEXT_SAFE}`}>
                Monthly usage
              </p>
              <div className="num mt-1 text-[26px] font-semibold leading-none tracking-[-0.04em] text-[color:var(--ink-1)]">
                {formatCredits(latestTotal)}
              </div>
              <p className="mt-1 text-[11px] text-[color:var(--ink-5)]">
                latest total · {latest.month}
              </p>
            </div>
            <div className="flex shrink-0 items-start justify-end gap-2">
              <div className={`flex items-center justify-end gap-2 rounded-full bg-[color:var(--surface-2)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.08em] text-[color:var(--ink-5)] ${TEXT_SAFE}`}>
                <LegendDot color={SMS_COLOR} label="SMS" />
                <LegendDot color={EMAIL_COLOR} label="Email" />
              </div>
              <div className="flex items-center gap-2 rounded-full bg-[color:var(--surface-2)] px-3 py-1.5 text-right">
                <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
                  Scale
                </div>
                <div className="num text-[13px] font-semibold text-[color:var(--ink-2)]">
                  {formatCompactCredits(chartMinUsage)}-{formatCompactCredits(chartMaxUsage)}
                </div>
              </div>
            </div>
          </div>

          <MonthlyUsageChart
            data={data}
            maxUsage={chartMaxUsage}
            minUsage={chartMinUsage}
          />
        </div>
      </div>
    </section>
  );
}

function MonthlyUsageChart({
  data,
  maxUsage,
  minUsage,
}: {
  data: MonthlyRevenuePoint[];
  maxUsage: number;
  minUsage: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chartWidthPct = `${Math.max(1, data.length / FOCUSED_MONTHS) * 100}%`;
  const midUsage = Math.round((maxUsage + minUsage) / 2);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;

    viewport.scrollLeft = viewport.scrollWidth;
  }, [data.length]);

  return (
    <div className="mt-4 min-h-0 min-w-0 flex-1">
      <div className="grid h-full min-h-[228px] min-w-0 grid-cols-[42px_minmax(0,1fr)] gap-2">
        <div className="grid h-[calc(100%-28px)] min-h-[200px] grid-rows-[auto_1fr_auto] pt-1 text-right text-[10px] font-semibold text-[color:var(--ink-5)]">
          <span>{formatCompactCredits(maxUsage)}</span>
          <span className="self-center">{formatCompactCredits(midUsage)}</span>
          <span>{formatCompactCredits(minUsage)}</span>
        </div>

        <div
          ref={scrollRef}
          className="min-w-0 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Scrollable 6-month SMS and Email usage trend"
        >
          <div className="h-full min-h-[228px] min-w-full" style={{ width: chartWidthPct }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--line-2)" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  interval={0}
                  tickFormatter={formatMonth}
                  stroke="var(--ink-5)"
                  fontSize={10}
                />
                <YAxis
                  hide
                  domain={[minUsage, maxUsage]}
                />
                <Line
                  type="linear"
                  dataKey="sms_usage"
                  stroke={SMS_COLOR}
                  strokeWidth={4}
                  dot={{ r: 4, strokeWidth: 2.5, fill: "white" }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="email_usage"
                  stroke={EMAIL_COLOR}
                  strokeWidth={4}
                  dot={{ r: 4, strokeWidth: 2.5, fill: "white" }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function formatCompactCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return Math.round(value).toLocaleString();
}
