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
import { formatMonth } from "@/lib/format";
import { MOBY_BRAND } from "@/lib/login-brand-colors";
import type { MonthlyRevenuePoint } from "./types";
import { TEXT_SAFE } from "./palette";

const REVENUE_COLOR = MOBY_BRAND.blue;
const FOCUSED_MONTHS = 6;

/**
 * Monthly revenue — actual data (spec §2.1): sum of `predict_clean_payments`
 * per month from the run summary. 100% observed, no model involved.
 */
export function MonthlyRevenueCard({ data }: { data: MonthlyRevenuePoint[] }) {
  const latest = data[data.length - 1];
  const revenueValues = data.map((point) => point.revenue);
  const maxRevenue = Math.max(...revenueValues, 0);
  const minRevenue = Math.min(...revenueValues, maxRevenue);
  const chartMaxRevenue = Math.max(100_000, Math.ceil(maxRevenue / 100_000) * 100_000);
  const chartMinRevenue = Math.max(0, Math.floor(minRevenue / 100_000) * 100_000);
  const avgRevenue =
    data.length > 0 ? data.reduce((sum, point) => sum + point.revenue, 0) / data.length : 0;

  return (
    <section className="surface-elev flex h-full min-w-0 flex-col overflow-hidden">
      <header className="flex min-w-0 items-start justify-between gap-4 border-b border-gray-100 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className={`type-section-title text-[20px] leading-tight ${TEXT_SAFE}`}>
            Monthly revenue
          </h2>
        </div>
        <span className="type-meta shrink-0 rounded-full bg-gray-50 px-3 py-1 text-[11px] font-normal">
          actual · ไม่ผ่านโมเดล
        </span>
      </header>

      <div className="flex flex-1 p-3 sm:p-4">
        <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-gray-100 bg-white p-3 shadow-[inset_0_1px_4px_rgba(0,0,0,0.04)] sm:p-4">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={`type-label ${TEXT_SAFE}`}>
                Latest month
              </p>
              <div className="mt-1 flex min-w-0 items-baseline gap-1.5">
                <span className="num text-[26px] leading-none text-[color:var(--ink-1)] tabular-nums">
                  ฿{formatCompactAmount(latest?.revenue ?? 0)}
                </span>
                <span className="type-muted text-[14px] font-medium leading-none">
                  {latest ? `· ${latest.payments} payments` : ""}
                </span>
              </div>
              <p className="type-meta mt-1 text-[11px] font-normal">
                {latest ? `${latest.month} · avg ฿${formatCompactAmount(avgRevenue)}/mo` : "ไม่มีข้อมูลการจ่ายเงิน"}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-right">
              <div className="type-label !text-[10px]">
                Scale
              </div>
              <div className="num text-[12px] text-[color:var(--ink-1)] tabular-nums">
                ฿{formatCompactAmount(chartMinRevenue)}-{formatCompactAmount(chartMaxRevenue)}
              </div>
            </div>
          </div>

          <MonthlyRevenueChart
            data={data}
            maxRevenue={chartMaxRevenue}
            minRevenue={chartMinRevenue}
          />
        </div>
      </div>
    </section>
  );
}

function MonthlyRevenueChart({
  data,
  maxRevenue,
  minRevenue,
}: {
  data: MonthlyRevenuePoint[];
  maxRevenue: number;
  minRevenue: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chartWidthPct = `${Math.max(1, data.length / FOCUSED_MONTHS) * 100}%`;
  const midRevenue = Math.round((maxRevenue + minRevenue) / 2);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;

    viewport.scrollLeft = viewport.scrollWidth;
  }, [data.length]);

  return (
    <div className="mt-4 min-h-0 min-w-0 flex-1">
      <div className="grid h-full min-h-[228px] min-w-0 grid-cols-[42px_minmax(0,1fr)] gap-2">
        <div className="type-muted grid h-[calc(100%-28px)] min-h-[200px] grid-rows-[auto_1fr_auto] pt-1 text-right text-[10px] font-normal">
          <span>{formatCompactAmount(maxRevenue)}</span>
          <span className="self-center">{formatCompactAmount(midRevenue)}</span>
          <span>{formatCompactAmount(minRevenue)}</span>
        </div>

        <div
          ref={scrollRef}
          className="min-w-0 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Scrollable monthly actual revenue trend"
        >
          <div className="h-full min-h-[228px] min-w-full" style={{ width: chartWidthPct }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="#f3f4f6" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  interval={0}
                  tickFormatter={formatMonth}
                  stroke="#999999"
                  fontSize={10}
                />
                <YAxis
                  hide
                  domain={[minRevenue, maxRevenue]}
                />
                <Line
                  type="linear"
                  dataKey="revenue"
                  stroke={REVENUE_COLOR}
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

function formatCompactAmount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return Math.round(value).toLocaleString();
}
