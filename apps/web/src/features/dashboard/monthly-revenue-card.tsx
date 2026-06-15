"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMonth } from "@/lib/format";
import { MOBY_BRAND } from "@/lib/login-brand-colors";
import type { MonthlyRevenuePoint } from "./types";
import { TEXT_SAFE } from "./palette";

const REVENUE_COLOR = MOBY_BRAND.blue;
const DEFAULT_VISIBLE = 6;
const MIN_VISIBLE = 1;
const CHART_HEIGHT = 228;
const Y_AXIS_WIDTH = 42;

type Viewport = {
  start: number;
  count: number;
};

function clampViewport(start: number, count: number, total: number): Viewport {
  if (total <= 0) return { start: 0, count: DEFAULT_VISIBLE };
  const minCount = Math.min(MIN_VISIBLE, total);
  const boundedCount = Math.min(Math.max(minCount, count), total);
  const maxStart = Math.max(0, total - boundedCount);
  const boundedStart = Math.min(Math.max(0, start), maxStart);
  return { start: boundedStart, count: boundedCount };
}

function defaultViewport(total: number): Viewport {
  if (total <= 0) return { start: 0, count: DEFAULT_VISIBLE };
  const count = Math.min(DEFAULT_VISIBLE, total);
  return { start: Math.max(0, total - count), count };
}

function formatRangeLabel(data: readonly MonthlyRevenuePoint[], viewport: Viewport): string {
  if (data.length === 0) return "";
  const from = Math.min(data.length - 1, Math.max(0, Math.floor(viewport.start)));
  const to = Math.min(data.length - 1, Math.max(0, Math.ceil(viewport.start + viewport.count) - 1));
  if (from === to) return formatMonth(data[from].month);
  return `${formatMonth(data[from].month)} – ${formatMonth(data[to].month)}`;
}

function visibleRevenueDomain(
  data: readonly MonthlyRevenuePoint[],
  viewport: Viewport,
): [number, number] {
  const from = Math.max(0, Math.floor(viewport.start));
  const to = Math.min(data.length, Math.ceil(viewport.start + viewport.count));
  const values = data.slice(from, to).map((point) => point.revenue);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, max);
  const chartMax = Math.max(100_000, Math.ceil(max / 100_000) * 100_000);
  const chartMin = Math.max(0, Math.floor(min / 100_000) * 100_000);
  return [chartMin, chartMax];
}

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
              <p className={`type-label ${TEXT_SAFE}`}>Latest month</p>
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
              <div className="type-label !text-[10px]">Scale</div>
              <div className="num text-[12px] text-[color:var(--ink-1)] tabular-nums">
                ฿{formatCompactAmount(chartMinRevenue)}-{formatCompactAmount(chartMaxRevenue)}
              </div>
            </div>
          </div>

          <MonthlyRevenueChart data={data} />
        </div>
      </div>
    </section>
  );
}

function MonthlyRevenueChart({ data }: { data: MonthlyRevenuePoint[] }) {
  const [viewport, setViewport] = useState<Viewport>(() => defaultViewport(data.length));
  const [dragging, setDragging] = useState(false);
  const [plotWidth, setPlotWidth] = useState(0);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startIndex: number } | null>(null);

  useEffect(() => {
    setViewport(defaultViewport(data.length));
  }, [data]);

  const applyViewport = useCallback(
    (next: Viewport) => {
      setViewport(clampViewport(next.start, next.count, data.length));
    },
    [data.length],
  );

  const syncPlotWidth = useCallback(() => {
    if (!plotRef.current) return;
    setPlotWidth(plotRef.current.clientWidth);
  }, []);

  useEffect(() => {
    syncPlotWidth();
    if (!plotRef.current) return;
    const observer = new ResizeObserver(syncPlotWidth);
    observer.observe(plotRef.current);
    return () => observer.disconnect();
  }, [syncPlotWidth, data.length]);

  useEffect(() => {
    const el = chartAreaRef.current;
    if (!el || data.length <= 1) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const width = rect.width > 0 ? rect.width : 1;

      setViewport((current) => {
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
          const monthDelta = (event.deltaX / width) * current.count;
          return clampViewport(current.start + monthDelta, current.count, data.length);
        }

        const ratio = (event.clientX - rect.left) / width;
        const factor = event.deltaY > 0 ? 1.08 : 1 / 1.08;
        const nextCount = current.count * factor;
        const anchor = current.start + ratio * current.count;
        const nextStart = anchor - ratio * nextCount;
        return clampViewport(nextStart, nextCount, data.length);
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [data.length]);

  const rangeLabel = formatRangeLabel(data, viewport);
  const canNavigate = data.length > 1;
  const [yMin, yMax] = visibleRevenueDomain(data, viewport);

  const slotWidth = plotWidth > 0 ? plotWidth / viewport.count : 0;
  const innerWidth = Math.max(plotWidth, data.length * slotWidth);
  const offsetX = viewport.start * slotWidth;

  const panByPixels = (dx: number, base: Viewport) => {
    const width = plotWidth || 1;
    const monthsPerPx = base.count / width;
    applyViewport({ start: base.start - dx * monthsPerPx, count: base.count });
  };

  const onChartPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canNavigate || event.button !== 0) return;
    dragRef.current = { startX: event.clientX, startIndex: viewport.start };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onChartPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    panByPixels(event.clientX - dragRef.current.startX, {
      start: dragRef.current.startIndex,
      count: viewport.count,
    });
  };

  const endChartDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className="mt-4 min-h-0 min-w-0 flex-1 space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11.5px] font-medium text-[color:var(--ink-4)]">{rangeLabel}</p>
        {canNavigate ? (
          <p className="text-[10.5px] text-[color:var(--ink-5)]">ลากเลื่อน · scroll ปรับ scale</p>
        ) : null}
      </div>

      <div
        ref={chartAreaRef}
        className={`min-h-[228px] touch-none select-none ${
          canNavigate ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
        onPointerDown={onChartPointerDown}
        onPointerMove={onChartPointerMove}
        onPointerUp={endChartDrag}
        onPointerCancel={endChartDrag}
      >
        <div className="flex" style={{ height: CHART_HEIGHT }}>
          <div className="shrink-0" style={{ width: Y_AXIS_WIDTH }}>
            <LineChart
              width={Y_AXIS_WIDTH}
              height={CHART_HEIGHT}
              data={[{ revenue: 0 }]}
              margin={{ top: 6, right: 0, bottom: 0, left: 0 }}
            >
              <YAxis
                domain={[yMin, yMax]}
                axisLine={false}
                tickLine={false}
                width={Y_AXIS_WIDTH}
                tickFormatter={formatCompactAmount}
                stroke="#999999"
                fontSize={10}
                tickCount={3}
              />
            </LineChart>
          </div>

          <div ref={plotRef} className="min-w-0 flex-1 overflow-hidden">
            {plotWidth > 0 ? (
              <div
                className="will-change-transform"
                style={{
                  width: innerWidth,
                  transform: `translateX(${-offsetX}px)`,
                }}
              >
                <LineChart
                  width={innerWidth}
                  height={CHART_HEIGHT}
                  data={[...data]}
                  margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
                >
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
                  <YAxis hide domain={[yMin, yMax]} />
                  <Tooltip
                    labelFormatter={(label: string) => formatMonth(label)}
                    formatter={(value: number) => [`฿${value.toLocaleString()}`, "Revenue"]}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                      boxShadow: "var(--shadow-1)",
                    }}
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
              </div>
            ) : null}
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
