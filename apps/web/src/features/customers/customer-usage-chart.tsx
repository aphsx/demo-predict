"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import type { MonthlyUsagePoint } from "@/lib/ml-api";
import { Panel } from "./customer-detail-primitives";

export type UsageTrendPoint = MonthlyUsagePoint;

const DEFAULT_VISIBLE = 6;
const MIN_VISIBLE = 1;
const Y_AXIS_WIDTH = 40;

type SeriesKey = "total" | "sms" | "email" | "bc" | "api" | "otp";

type Viewport = {
  start: number;
  count: number;
};

interface SeriesDef {
  key: SeriesKey;
  label: string;
  color: string;
  group: "total" | "channel" | "source";
}

const SERIES: SeriesDef[] = [
  { key: "total", label: "รวม", color: MOBY_BRAND.blue, group: "total" },
  { key: "sms", label: "SMS", color: MOBY_BRAND.orange, group: "channel" },
  { key: "email", label: "Email", color: "#10b981", group: "channel" },
  { key: "bc", label: "BC", color: "#8b5cf6", group: "source" },
  { key: "api", label: "API", color: "#06b6d4", group: "source" },
  { key: "otp", label: "OTP", color: MOBY_BRAND.orangeWarm, group: "source" },
];

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

function formatRangeLabel(data: readonly UsageTrendPoint[], viewport: Viewport): string {
  if (data.length === 0) return "";
  const from = Math.min(data.length - 1, Math.max(0, Math.floor(viewport.start)));
  const to = Math.min(data.length - 1, Math.max(0, Math.ceil(viewport.start + viewport.count) - 1));
  if (from === to) return formatMonth(data[from].month);
  return `${formatMonth(data[from].month)} – ${formatMonth(data[to].month)}`;
}

function visibleYMax(
  data: readonly UsageTrendPoint[],
  viewport: Viewport,
  keys: readonly SeriesKey[],
): number {
  const from = Math.max(0, Math.floor(viewport.start));
  const to = Math.min(data.length, Math.ceil(viewport.start + viewport.count));
  let max = 1;
  for (const row of data.slice(from, to)) {
    for (const key of keys) {
      max = Math.max(max, row[key]);
    }
  }
  return max;
}

function useUsageSeries() {
  const [active, setActive] = useState<Set<SeriesKey>>(() => new Set<SeriesKey>(["total"]));

  const toggle = (key: SeriesKey) => {
    setActive((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      if (next.size === 0) next.add("total");
      return next;
    });
  };

  return { active, toggle };
}

export function UsageSeriesToggles({
  active,
  onToggle,
}: {
  active: ReadonlySet<SeriesKey>;
  onToggle: (key: SeriesKey) => void;
}) {
  return (
    <>
      {SERIES.map((s, index) => {
        const isActive = active.has(s.key);
        const showDivider = index > 0 && SERIES[index - 1].group !== s.group;
        return (
          <span key={s.key} className="flex items-center gap-1">
            {showDivider ? <span className="mx-0.5 h-3.5 w-px bg-gray-200" aria-hidden /> : null}
            <button
              type="button"
              onClick={() => onToggle(s.key)}
              className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10.5px] font-semibold transition-colors ${
                isActive
                  ? "border-transparent text-white"
                  : "border-gray-200 bg-white text-[color:var(--ink-4)] hover:bg-gray-50"
              }`}
              style={isActive ? { backgroundColor: s.color } : undefined}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: isActive ? "rgba(255,255,255,0.9)" : s.color }}
              />
              {s.label}
            </button>
          </span>
        );
      })}
    </>
  );
}

export function UsageCreditPanel({
  data,
  children,
}: {
  data: readonly UsageTrendPoint[];
  children: ReactNode;
}) {
  const { active, toggle } = useUsageSeries();

  return (
    <Panel
      title="การใช้งาน Credit"
      headerRight={<UsageSeriesToggles active={active} onToggle={toggle} />}
    >
      <div className="space-y-4">
        {data.length > 0 ? (
          <UsageLineChart data={data} active={active} compact />
        ) : (
          <div className="rounded-[24px] border border-gray-200 bg-white p-6 text-center text-[13px] text-[color:var(--ink-4)]">
            ไม่มีข้อมูล usage สำหรับ account นี้
          </div>
        )}
        {children}
      </div>
    </Panel>
  );
}

export function UsageLineChart({
  data,
  active,
  compact = false,
}: {
  data: readonly UsageTrendPoint[];
  active: ReadonlySet<SeriesKey>;
  compact?: boolean;
}) {
  const chartHeight = compact ? 220 : 280;
  const [viewport, setViewport] = useState<Viewport>(() => defaultViewport(data.length));
  const [dragging, setDragging] = useState(false);
  const [plotWidth, setPlotWidth] = useState(0);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startIndex: number } | null>(null);
  const navDragRef = useRef<{ mode: "move" | "resize-left" | "resize-right"; startX: number; viewport: Viewport } | null>(
    null,
  );

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

  const activeSeries = SERIES.filter((s) => active.has(s.key));
  const activeKeys = activeSeries.map((s) => s.key);
  const rangeLabel = formatRangeLabel(data, viewport);
  const canNavigate = data.length > 1;
  const maxTotal = Math.max(...data.map((row) => row.total), 1);
  const yMax = visibleYMax(data, viewport, activeKeys);

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
    const monthDelta = (dx / trackWidth) * data.length;

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
    const center = ratio * data.length;
    applyViewport({ start: center - viewport.count / 2, count: viewport.count });
  };

  const thumbLeftPct = (viewport.start / data.length) * 100;
  const thumbWidthPct = (viewport.count / data.length) * 100;

  return (
    <div className="space-y-2">
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
          <div className="flex" style={{ height: chartHeight }}>
            <div className="shrink-0" style={{ width: Y_AXIS_WIDTH }}>
              <LineChart
                width={Y_AXIS_WIDTH}
                height={chartHeight}
                data={[{ total: 0 }]}
                margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
              >
                <YAxis
                  domain={[0, yMax]}
                  axisLine={false}
                  tickLine={false}
                  width={Y_AXIS_WIDTH}
                  tickFormatter={formatCompact}
                  stroke="#999999"
                  fontSize={10}
                  tickCount={5}
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
                    height={chartHeight}
                    data={[...data]}
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
                      labelFormatter={(label: string) => formatMonth(label)}
                      formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        fontSize: 12,
                        boxShadow: "var(--shadow-1)",
                      }}
                    />
                    {activeSeries.map((s) => (
                      <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label}
                        stroke={s.color}
                        strokeWidth={s.key === "total" ? 4 : 2.5}
                        dot={{ r: 3, strokeWidth: 2, fill: "white" }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {canNavigate ? (
          <div
            className="relative h-6 rounded-lg border border-gray-200 bg-gray-50 px-0.5 touch-none select-none"
            onPointerMove={onNavigatorPointerMove}
            onPointerUp={endNavigatorDrag}
            onPointerCancel={endNavigatorDrag}
            onClick={onNavigatorTrackClick}
          >
            <div className="pointer-events-none absolute inset-x-0.5 inset-y-1 flex items-end gap-px">
              {data.map((row) => (
                <div
                  key={row.month}
                  className="min-w-0 flex-1 rounded-sm bg-[color:var(--moby-200)]"
                  style={{ height: `${Math.max(10, (row.total / maxTotal) * 100)}%`, opacity: 0.55 }}
                />
              ))}
            </div>

            <div
              className="absolute inset-y-0.5 rounded-md border border-[color:var(--moby-500)] bg-[color:var(--moby-500)]/10"
              style={{ left: `${thumbLeftPct}%`, width: `${thumbWidthPct}%` }}
              onPointerDown={(event) => onNavigatorPointerDown(event, "move")}
            >
              <div
                className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l-md bg-[color:var(--moby-500)]/25"
                onPointerDown={(event) => onNavigatorPointerDown(event, "resize-left")}
              />
              <div
                className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-md bg-[color:var(--moby-500)]/25"
                onPointerDown={(event) => onNavigatorPointerDown(event, "resize-right")}
              />
            </div>
          </div>
        ) : null}
    </div>
  );
}
