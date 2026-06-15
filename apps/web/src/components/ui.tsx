"use client";
import { ReactNode } from "react";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2,
  Clock, Activity, ArrowRight, RefreshCw,
} from "lucide-react";

/* ────────────────────────────────────────── */
/*  PageHeader (in-page sub header)          */
/* ────────────────────────────────────────── */
export function PageHeader({
  title, actions,
}: { eyebrow?: ReactNode; title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="px-8 pt-6 pb-2 flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h2 className="type-display text-[24px] leading-tight">{title}</h2>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

/* ────────────────────────────────────────── */
/*  SectionCard                              */
/* ────────────────────────────────────────── */
export function SectionCard({
  title,
  hint,
  eyebrow,
  right,
  children,
  className = "",
}: {
  title?: ReactNode;
  hint?: ReactNode;
  eyebrow?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface-elev overflow-hidden ${className}`}>
      {(title || right || eyebrow) && (
        <header className="border-b border-gray-100 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              {eyebrow ? <p className="type-label">{eyebrow}</p> : null}
              {title ? <h2 className="type-section-title mt-1 text-[20px]">{title}</h2> : null}
              {hint ? (
                <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[color:var(--ink-4)]">{hint}</p>
              ) : null}
            </div>
            {right ? <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div> : null}
          </div>
        </header>
      )}
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

/* ────────────────────────────────────────── */
/*  KpiCard                                  */
/* ────────────────────────────────────────── */
export function KpiCard({
  label, value, hint, delta, deltaLabel, accent = "blue", spark, format = "number", currency,
}: {
  label: string;
  value: number | string;
  hint?: string;
  delta?: number;            // positive = up
  deltaLabel?: string;
  accent?: "blue" | "violet" | "amber" | "rose" | "emerald" | "slate";
  spark?: number[];
  format?: "number" | "currency" | "percent" | "raw";
  currency?: string;
}) {
  const accentColor = ACCENTS[accent];
  const formatted =
    typeof value === "string"
      ? value
      : format === "currency"
        ? `${(value as number).toLocaleString()} ${currency || "฿"}`
        : format === "percent"
          ? `${(value as number).toFixed(1)}%`
          : (value as number).toLocaleString();

  return (
    <div className="surface lift p-5 relative overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: accentColor }}
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="type-label">
            {label}
          </div>
          <div className="num mt-1.5 text-[28px] text-[color:var(--ink-1)]">
            {formatted}
          </div>
          {hint && <div className="type-meta text-[12px] mt-0.5">{hint}</div>}
        </div>
        {delta !== undefined && <DeltaPill value={delta} label={deltaLabel} />}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3">
          <Sparkline values={spark} color={accentColor} />
        </div>
      )}
    </div>
  );
}

const ACCENTS = {
  blue:    "var(--moby-600)",
  violet:  "#7c3aed",
  amber:   "#d97706",
  rose:    "#e11d48",
  emerald: "var(--moby-600)",
  slate:   "#64748b",
};

/* ────────────────────────────────────────── */
/*  DeltaPill                                */
/* ────────────────────────────────────────── */
export function DeltaPill({ value, label }: { value: number; label?: string }) {
  const up = value > 0, flat = value === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const color = flat ? "text-[color:var(--ink-4)] bg-gray-50"
    : up ? "text-[color:var(--ok)] bg-[color:var(--ok-bg)]"
    : "text-[color:var(--danger)] bg-[color:var(--danger-bg)]";
  return (
    <span className={`pill ${color}`}>
      <Icon size={11} />
      <span className="num">{flat ? "0%" : `${up ? "+" : ""}${value.toFixed(1)}%`}</span>
      {label && <span className="opacity-70">{label}</span>}
    </span>
  );
}

/* ────────────────────────────────────────── */
/*  StatusPill — solid fill, matches /customers lifecycle badges */
/* ────────────────────────────────────────── */
const PILL_TONES: Record<string, string> = {
  ok:      "#006bff",
  brand:   "#006bff",
  warn:    "#ffa400",
  danger:  "#fc4c02",
  info:    "#1893f0",
  neutral: "#9ca3af",
  violet:  "#7c3aed",
  warm:    "#ffa400",
  orange:  "#fc4c02",
};

export function StatusPill({
  tone = "neutral",
  icon: Icon,
  children,
  loading = false,
}: {
  tone?: keyof typeof PILL_TONES;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  children: ReactNode;
  /** @deprecated dots removed — kept for call-site compat */
  dot?: boolean;
  loading?: boolean;
}) {
  const bg = PILL_TONES[tone] ?? PILL_TONES.neutral;
  return (
    <span
      className="inline-flex h-[26px] items-center justify-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-white"
      style={{ backgroundColor: bg }}
    >
      {loading ? <RefreshCw size={11} className="animate-spin" /> : Icon ? <Icon size={11} /> : null}
      {children}
    </span>
  );
}

/* ────────────────────────────────────────── */
/*  Lifecycle / churn / urgency mappers     */
/* ────────────────────────────────────────── */
/* Tone mapping follows the dashboard brand palettes (palette.ts):
   Paid/Low/Stable = blue, Free/Medium/Warning = #FFA400, Churned/High/Critical = #FC4C02 */
export const lifecycleTone = (s: string): keyof typeof PILL_TONES =>
  s === "Active Paid" ? "brand"
  : s === "Active Free" ? "warm"
  : s === "Churned" ? "orange"
  : s === "Ghost" ? "neutral"
  : "neutral";

export const churnTone = (t: string): keyof typeof PILL_TONES =>
  t === "High" ? "orange" : t === "Medium" ? "warm" : t === "Low" ? "brand" : "neutral";

export const urgencyTone = (u: string): keyof typeof PILL_TONES =>
  u === "Critical" ? "orange" : u === "Warning" ? "warm" : u === "Monitor" ? "neutral" : u === "Stable" ? "brand" : "neutral";

/* ────────────────────────────────────────── */
/*  StackBar — compact horizontal stack      */
/* ────────────────────────────────────────── */
export function StackBar({
  data, palette, height = 8,
}: { data: Record<string, number>; palette: Record<string, string>; height?: number }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (!total) return <div className="text-[11.5px] text-[color:var(--ink-5)]">No data</div>;
  return (
    <div>
      <div className="flex w-full overflow-hidden rounded-full" style={{ height }}>
        {Object.entries(data).map(([k, v]) => (
          <div
            key={k}
            title={`${k}: ${v.toLocaleString()}`}
            style={{ width: `${(v / total) * 100}%`, background: palette[k] || "#cbd5e1" }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {Object.entries(data).map(([k, v]) => (
          <span key={k} className="text-[11.5px] text-[color:var(--ink-3)] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: palette[k] || "#cbd5e1" }} />
            <span className="text-[color:var(--ink-2)]">{k}</span>
            <span className="num text-[color:var(--ink-4)]">{v.toLocaleString()}</span>
            <span className="text-[color:var(--ink-5)]">·</span>
            <span className="num text-[color:var(--ink-5)]">{((v / total) * 100).toFixed(1)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────── */
/*  Sparkline                                 */
/* ────────────────────────────────────────── */
export function Sparkline({ values, color = "var(--moby-600)", h = 28 }: { values: number[]; color?: string; h?: number }) {
  if (values.length < 2) return null;
  const w = 120;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y] as const;
  });
  const path = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={area} fill={color} fillOpacity="0.10" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/* ────────────────────────────────────────── */
/*  ProgressMeter                             */
/* ────────────────────────────────────────── */
export function ProgressMeter({
  value, max = 100, tone = "blue", label, showValue = true,
}: { value: number; max?: number; tone?: "blue" | "rose" | "emerald" | "amber" | "slate"; label?: string; showValue?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = ({
    blue: "var(--moby-600)", rose: "var(--danger)", emerald: "var(--ok)", amber: "var(--warn)", slate: "#6b7280"
  } as const)[tone];
  return (
    <div>
      {(label || showValue) && (
        <div className="flex items-baseline justify-between mb-1">
          {label && <span className="text-[11.5px] text-[color:var(--ink-4)]">{label}</span>}
          {showValue && <span className="num text-[12px]">{pct.toFixed(0)}%</span>}
        </div>
      )}
      <div className="w-full h-1.5 rounded-full bg-gray-50 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────── */
/*  EmptyState                                */
/* ────────────────────────────────────────── */
export function EmptyState({
  title, hint, icon: Icon = Activity, action,
}: { title: string; hint?: string; icon?: any; action?: ReactNode }) {
  return (
    <div className="surface-soft py-10 px-6 text-center">
      <div className="inline-flex items-center justify-center text-[color:var(--ink-4)] mb-3">
        <Icon size={18} />
      </div>
      <div className="text-[13.5px] font-medium text-[color:var(--ink-2)]">{title}</div>
      {hint && <div className="text-[12px] text-[color:var(--ink-5)] mt-1 max-w-md mx-auto">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ────────────────────────────────────────── */
/*  Skeleton                                  */
/* ────────────────────────────────────────── */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/* ────────────────────────────────────────── */
/*  ActionChip — link-like inline action      */
/* ────────────────────────────────────────── */
export function ActionChip({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[12px] font-medium text-[color:var(--ink-3)] hover:text-[color:var(--moby-600)] hover:underline underline-offset-2"
    >
      {children}
      <ArrowRight size={12} />
    </button>
  );
}

/* ────────────────────────────────────────── */
/*  AlertItem (used on dashboard + alerts)   */
/* ────────────────────────────────────────── */
export function AlertItem({
  severity = "warn", title, time, children,
}: { severity?: "danger" | "warn" | "info" | "ok"; title: string; time?: string; children?: ReactNode }) {
  const iconMap = {
    danger: <AlertTriangle size={14} className="text-[color:var(--danger)]" />,
    warn:   <AlertTriangle size={14} className="text-[color:var(--warn)]" />,
    info:   <Activity size={14} className="text-[color:var(--info)]" />,
    ok:     <CheckCircle2 size={14} className="text-[color:var(--ok)]" />,
  };
  return (
    <div className="flex gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
      <div className="shrink-0 pt-0.5">
        {iconMap[severity]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[13px] font-medium text-[color:var(--ink-1)] truncate">{title}</div>
          {time && (
            <div className="text-[11px] text-[color:var(--ink-5)] flex items-center gap-1 shrink-0">
              <Clock size={10} /> {time}
            </div>
          )}
        </div>
        {children && <div className="text-[12px] text-[color:var(--ink-4)] mt-0.5">{children}</div>}
      </div>
    </div>
  );
}
