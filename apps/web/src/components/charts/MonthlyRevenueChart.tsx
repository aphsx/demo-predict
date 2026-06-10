"use client";

import { useEffect, useRef } from "react";
import { formatCompactCurrency, formatMonth } from "@/lib/format";
import type { MonthlyRevenuePoint } from "@/mocks/monthly-revenue";

const TEXT_SAFE = "min-w-0 break-words [overflow-wrap:anywhere]";

type MonthlyRevenueChartProps = {
  data: MonthlyRevenuePoint[];
  /** Unique SVG gradient id per chart instance on the page. */
  gradientId: string;
  /** Color of the area fill under the line. */
  areaColor: string;
  /** Maps a revenue value to a line/point color within [min, max]. */
  bandColor: (value: number, min: number, max: number) => string;
  hint?: string;
};

export function MonthlyRevenueChart({
  data,
  gradientId,
  areaColor,
  bandColor,
  hint,
}: MonthlyRevenueChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = Math.max(720, data.length * 118);
  const height = 290;
  const padding = { top: 42, right: 30, bottom: 38, left: 74 };
  const values = data.map((point) => point.revenue);
  const colorMin = Math.min(...values);
  const colorMax = Math.max(...values);
  const min = colorMin * 0.94;
  const max = colorMax * 1.04;
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
  const lineSegments = points.slice(1).map((point, index) => {
    const previous = points[index];
    const segmentValue = (previous.revenue + point.revenue) / 2;
    return {
      key: `${previous.month}-${point.month}`,
      d: `M${previous.x},${previous.y} L${point.x},${point.y}`,
      color: bandColor(segmentValue, colorMin, colorMax),
    };
  });
  const gridValues = [max, min + range * 0.5, min];

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollLeft = scrollContainer.scrollWidth;
  }, []);

  return (
    <div className="min-w-0 overflow-hidden rounded-[24px] border border-gray-200 bg-white p-4">
      {hint && (
        <div className={`mb-2 text-[11px] text-gray-400 ${TEXT_SAFE}`}>{hint}</div>
      )}
      <div ref={scrollRef} className="min-w-0 overflow-x-auto overscroll-x-contain pb-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[720px]"
          style={{ width }}
          aria-label="Monthly revenue trend chart"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={areaColor} stopOpacity="0.20" />
              <stop offset="100%" stopColor={areaColor} stopOpacity="0" />
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
                  stroke="#f3f4f6"
                  strokeDasharray="5 7"
                />
                <text x={16} y={y + 4} className="fill-gray-400 text-[11px]">
                  {formatCompactCurrency(value)}
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill={`url(#${gradientId})`} />
          {lineSegments.map((segment) => (
            <path
              key={segment.key}
              d={segment.d}
              fill="none"
              stroke={segment.color}
              strokeWidth="4"
              strokeLinecap="round"
            />
          ))}

          {points.map((point) => (
            <g key={point.month}>
              <text
                x={point.x}
                y={point.y - 12}
                textAnchor="middle"
                className="fill-gray-700 text-[10px] font-semibold"
              >
                {formatCompactCurrency(point.revenue)}
              </text>
              <circle
                cx={point.x}
                cy={point.y}
                r="5"
                fill="white"
                stroke={bandColor(point.revenue, colorMin, colorMax)}
                strokeWidth="3"
              />
              <text
                x={point.x}
                y={height - 14}
                textAnchor="middle"
                className="fill-gray-400 text-[10px]"
              >
                {formatMonth(point.month)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
