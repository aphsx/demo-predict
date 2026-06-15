"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMonth } from "@/lib/format";
import { MOBY_BRAND } from "@/lib/login-brand-colors";
import type { PaymentEvent } from "@/lib/ml-api";

const DEFAULT_VISIBLE = 12;
const MIN_VISIBLE = 1;
const CHART_HEIGHT = 220;
const Y_AXIS_WIDTH = 40;

type MonthlyPayment = {
  month: string;
  amount: number;
  credit_add: number;
  count: number;
};

type Viewport = {
  start: number;
  count: number;
};

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return Math.round(value).toLocaleString();
}

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

function visibleYMax(monthly: readonly MonthlyPayment[], viewport: Viewport): number {
  const from = Math.max(0, Math.floor(viewport.start));
  const to = Math.min(monthly.length, Math.ceil(viewport.start + viewport.count));
  const slice = monthly.slice(from, to);
  return Math.max(...slice.map((row) => row.amount), 1);
}

function formatRangeLabel(monthly: readonly MonthlyPayment[], viewport: Viewport): string {
  if (monthly.length === 0) return "";
  const from = Math.min(monthly.length - 1, Math.max(0, Math.floor(viewport.start)));
  const to = Math.min(monthly.length - 1, Math.max(0, Math.ceil(viewport.start + viewport.count) - 1));
  if (from === to) return formatMonth(monthly[from].month);
  return `${formatMonth(monthly[from].month)} – ${formatMonth(monthly[to].month)}`;
}

/** Aggregate individual payment events into per-month buckets (chronological). */
function aggregateByMonth(payments: readonly PaymentEvent[]): MonthlyPayment[] {
  const byMonth = new Map<string, MonthlyPayment>();
  for (const p of payments) {
    const month = p.payment_date.slice(0, 7); // YYYY-MM
    const bucket = byMonth.get(month) ?? { month, amount: 0, credit_add: 0, count: 0 };
    bucket.amount += p.amount;
    bucket.credit_add += p.credit_add;
    bucket.count += 1;
    byMonth.set(month, bucket);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function CustomerPaymentChart({ payments }: { payments: readonly PaymentEvent[] }) {
  const monthly = useMemo(() => aggregateByMonth(payments), [payments]);
  const [viewport, setViewport] = useState<Viewport>(() => defaultViewport(monthly.length));
  const [dragging, setDragging] = useState(false);
  const [plotWidth, setPlotWidth] = useState(0);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startIndex: number } | null>(null);
  const navDragRef = useRef<{ mode: "move" | "resize-left" | "resize-right"; startX: number; viewport: Viewport } | null>(
    null,
  );

  useEffect(() => {
    setViewport(defaultViewport(monthly.length));
  }, [payments]);

  const applyViewport = useCallback(
    (next: Viewport) => {
      setViewport(clampViewport(next.start, next.count, monthly.length));
    },
    [monthly.length],
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
  }, [syncPlotWidth, payments.length]);

  useEffect(() => {
    const el = chartAreaRef.current;
    if (!el || monthly.length <= 1) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const width = rect.width > 0 ? rect.width : 1;

      setViewport((current) => {
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
          const monthDelta = (event.deltaX / width) * current.count;
          return clampViewport(current.start + monthDelta, current.count, monthly.length);
        }

        const ratio = (event.clientX - rect.left) / width;
        const factor = event.deltaY > 0 ? 1.08 : 1 / 1.08;
        const nextCount = current.count * factor;
        const anchor = current.start + ratio * current.count;
        const nextStart = anchor - ratio * nextCount;
        return clampViewport(nextStart, nextCount, monthly.length);
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [monthly.length, payments.length]);

  if (payments.length === 0) {
    return (
      <div className="rounded-[24px] border border-gray-200 bg-white p-6 text-center text-[13px] text-[color:var(--ink-4)]">
        ไม่มีประวัติการชำระเงินสำหรับ account นี้
      </div>
    );
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalCredits = payments.reduce((sum, p) => sum + p.credit_add, 0);
  const avgTicket = totalPaid / payments.length;

  const rangeLabel = formatRangeLabel(monthly, viewport);
  const canNavigate = monthly.length > 1;
  const maxAmount = Math.max(...monthly.map((row) => row.amount), 1);
  const yMax = visibleYMax(monthly, viewport);

  const slotWidth = plotWidth > 0 ? plotWidth / viewport.count : 0;
  const innerWidth = Math.max(plotWidth, monthly.length * slotWidth);
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

  const onNavigatorPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    mode: "move" | "resize-left" | "resize-right",
  ) => {
    if (!canNavigate) return;
    event.stopPropagation();
    navDragRef.current = { mode, startX: event.clientX, viewport };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onNavigatorPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = navDragRef.current;
    if (!drag) return;

    const track = event.currentTarget;
    const trackWidth = track.clientWidth || 1;
    const dx = event.clientX - drag.startX;
    const monthDelta = (dx / trackWidth) * monthly.length;

    if (drag.mode === "move") {
      applyViewport({ start: drag.viewport.start + monthDelta, count: drag.viewport.count });
      return;
    }

    if (drag.mode === "resize-left") {
      applyViewport({
        start: drag.viewport.start + monthDelta,
        count: drag.viewport.count - monthDelta,
      });
      return;
    }

    applyViewport({ start: drag.viewport.start, count: drag.viewport.count + monthDelta });
  };

  const endNavigatorDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!navDragRef.current) return;
    navDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onNavigatorTrackClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canNavigate || navDragRef.current || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const center = ratio * monthly.length;
    applyViewport({ start: center - viewport.count / 2, count: viewport.count });
  };

  const thumbLeftPct = (viewport.start / monthly.length) * 100;
  const thumbWidthPct = (viewport.count / monthly.length) * 100;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-[11.5px] font-medium text-[color:var(--ink-4)]">{rangeLabel}</p>
          {canNavigate ? (
            <p className="text-[10.5px] text-[color:var(--ink-5)]">ลากเลื่อน · scroll ปรับ scale</p>
          ) : null}
        </div>

        <div
          ref={chartAreaRef}
          className={`overflow-hidden rounded-[24px] border border-gray-200 bg-white p-4 touch-none select-none ${
            canNavigate ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
          }`}
          onPointerDown={onChartPointerDown}
          onPointerMove={onChartPointerMove}
          onPointerUp={endChartDrag}
          onPointerCancel={endChartDrag}
        >
          <div className="flex" style={{ height: CHART_HEIGHT }}>
            <div className="shrink-0" style={{ width: Y_AXIS_WIDTH }}>
              <BarChart
                width={Y_AXIS_WIDTH}
                height={CHART_HEIGHT}
                data={[{ amount: 0 }]}
                margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
              >
                <YAxis
                  domain={[0, yMax]}
                  axisLine={false}
                  tickLine={false}
                  width={Y_AXIS_WIDTH}
                  tickFormatter={(v: number) => `฿${formatCompact(v)}`}
                  stroke="#999999"
                  fontSize={10}
                  tickCount={5}
                />
              </BarChart>
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
                  <BarChart
                    width={innerWidth}
                    height={CHART_HEIGHT}
                    data={[...monthly]}
                    margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
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
                    <YAxis hide domain={[0, yMax]} />
                    <Tooltip
                      cursor={{ fill: "rgba(0,107,255,0.06)" }}
                      labelFormatter={(label: string) => formatMonth(label)}
                      formatter={(value: number, _name, item) => {
                        const row = item?.payload as MonthlyPayment | undefined;
                        return [
                          `฿${value.toLocaleString()} · ${row?.count ?? 0} payments · ${(row?.credit_add ?? 0).toLocaleString()} credits`,
                          "Paid",
                        ];
                      }}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        fontSize: 12,
                        boxShadow: "var(--shadow-1)",
                      }}
                    />
                    <Bar
                      dataKey="amount"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={Math.max(10, slotWidth * 0.62)}
                      isAnimationActive={false}
                    >
                      {monthly.map((row) => (
                        <Cell key={row.month} fill={MOBY_BRAND.blue} />
                      ))}
                    </Bar>
                  </BarChart>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {canNavigate ? (
          <div
            className="relative h-9 rounded-xl border border-gray-200 bg-gray-50 px-1 touch-none select-none"
            onPointerMove={onNavigatorPointerMove}
            onPointerUp={endNavigatorDrag}
            onPointerCancel={endNavigatorDrag}
            onClick={onNavigatorTrackClick}
          >
            <div className="pointer-events-none absolute inset-x-1 inset-y-2 flex items-end gap-px">
              {monthly.map((row) => (
                <div
                  key={row.month}
                  className="min-w-0 flex-1 rounded-sm bg-[color:var(--moby-200)]"
                  style={{ height: `${Math.max(18, (row.amount / maxAmount) * 100)}%`, opacity: 0.55 }}
                />
              ))}
            </div>

            <div
              className="absolute inset-y-1 rounded-lg border border-[color:var(--moby-500)] bg-[color:var(--moby-500)]/10"
              style={{ left: `${thumbLeftPct}%`, width: `${thumbWidthPct}%` }}
              onPointerDown={(event) => onNavigatorPointerDown(event, "move")}
            >
              <div
                className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-lg bg-[color:var(--moby-500)]/25"
                onPointerDown={(event) => onNavigatorPointerDown(event, "resize-left")}
              />
              <div
                className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-lg bg-[color:var(--moby-500)]/25"
                onPointerDown={(event) => onNavigatorPointerDown(event, "resize-right")}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-2 lg:grid-cols-1 lg:w-[148px]">
        <PaymentStat label="Total paid" value={`฿${formatCompact(totalPaid)}`} hint={`${payments.length} payments`} />
        <PaymentStat label="Avg ticket" value={`฿${formatCompact(avgTicket)}`} hint="per payment" />
        <PaymentStat label="Credits bought" value={totalCredits.toLocaleString()} hint="total top-up" />
      </div>
    </div>
  );
}

function PaymentStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 lg:p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] lg:text-[10.5px]">
        {label}
      </p>
      <p className="num mt-1 text-[17px] font-semibold lg:text-[20px]">{value}</p>
      <p className="mt-0.5 text-[10.5px] text-[color:var(--ink-4)] lg:mt-1 lg:text-[11.5px]">{hint}</p>
    </div>
  );
}
