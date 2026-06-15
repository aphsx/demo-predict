"use client";

import { MOBY_BRAND } from "@/lib/login-brand-colors";

export type UsageTrendPoint = {
  month: string;
  usage: number;
};

export function UsageLineChart({
  data,
  compact = false,
}: {
  data: readonly UsageTrendPoint[];
  compact?: boolean;
}) {
  const width = 720;
  const height = compact ? 210 : 260;
  const paddingX = 36;
  const paddingY = 28;
  const values = data.map((point) => point.usage);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = data.map((point, index) => {
    const x = paddingX + (index / Math.max(1, data.length - 1)) * (width - paddingX * 2);
    const y = paddingY + (1 - (point.usage - min) / range) * (height - paddingY * 2);
    return { ...point, x, y };
  });
  const usageColorStops = points.map((point, index) => ({
    offset: `${(index / Math.max(1, points.length - 1)) * 100}%`,
    color: usageOrangeColor((point.usage - min) / range),
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${path} L ${points[points.length - 1]?.x ?? paddingX} ${height - paddingY} L ${paddingX} ${height - paddingY} Z`;

  return (
    <div className="overflow-hidden rounded-[24px] border border-gray-200 bg-white p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`${compact ? "h-[220px]" : "h-[280px]"} w-full`}
        role="img"
        aria-label="Customer usage trend line chart"
      >
        <defs>
          <linearGradient id="usageLineGradient" x1="0" x2="1" y1="0" y2="0">
            {usageColorStops.map((stop) => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
          <linearGradient id="usageAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={MOBY_BRAND.orangeWarm} stopOpacity="0.24" />
            <stop offset="100%" stopColor={MOBY_BRAND.orangeWarm} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3].map((tick) => {
          const y = paddingY + tick * ((height - paddingY * 2) / 3);
          return (
            <line
              key={tick}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              stroke="rgba(13,17,35,0.08)"
              strokeDasharray="4 6"
            />
          );
        })}

        <path d={areaPath} fill="url(#usageAreaGradient)" />
        <path d={path} fill="none" stroke="url(#usageLineGradient)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />

        {points.map((point) => (
          <g key={point.month}>
            <circle
              cx={point.x}
              cy={point.y}
              r="7"
              fill="white"
              stroke={usageOrangeColor((point.usage - min) / range)}
              strokeWidth="3"
            />
            <text x={point.x} y={height - 6} textAnchor="middle" className="fill-gray-400 text-[11px] font-semibold">
              {point.month}
            </text>
            <text x={point.x} y={point.y - 14} textAnchor="middle" className="fill-gray-600 text-[11px] font-semibold">
              {(point.usage / 1000).toFixed(0)}k
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function usageOrangeColor(normalizedValue: number): string {
  const pct = Math.max(0, Math.min(1, normalizedValue));
  const low = { r: 255, g: 164, b: 0 };
  const high = { r: 252, g: 76, b: 2 };
  const r = Math.round(low.r + (high.r - low.r) * pct);
  const g = Math.round(low.g + (high.g - low.g) * pct);
  const b = Math.round(low.b + (high.b - low.b) * pct);
  return `rgb(${r}, ${g}, ${b})`;
}
