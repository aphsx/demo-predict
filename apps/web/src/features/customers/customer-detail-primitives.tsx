"use client";

import type { ElementType, ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Gem,
  TrendingDown,
} from "lucide-react";
import { MarkdownLite } from "@/components/chat/markdown-lite";
import { MOBY_BRAND } from "@/lib/login-brand-colors";
import type { ChurnFactor } from "@/lib/ml-api";
import { composeReasoning } from "./reasoning";
import type { CustomerDetail } from "./customer-detail-view";

const CHURN_COLOR = "#fc4c02";
const CHURN_GRADIENT = `linear-gradient(90deg, ${MOBY_BRAND.orangeWarm} 0%, ${CHURN_COLOR} 100%)`;
const BLUE_GRADIENT = `linear-gradient(90deg, ${MOBY_BRAND.blue} 0%, ${MOBY_BRAND.blueLight} 100%)`;

// ── Layout ──────────────────────────────────────────────────────────────────

export function Panel({
  title,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`surface-elev flex min-h-0 flex-col overflow-hidden ${className ?? ""}`}>
      <div className="shrink-0 border-b border-gray-100 px-5 py-4">
        <h2 className="text-[20px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)]">
          {title}
        </h2>
      </div>
      <div className={`p-5 ${bodyClassName ?? ""}`}>{children}</div>
    </section>
  );
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export function HeroMetric({
  label,
  value,
  hint,
  valueColor,
}: {
  label: string;
  value: string;
  hint: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[22px] border border-gray-200 bg-white/80 px-4 py-3.5 shadow-[var(--shadow-1)]">
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
          {label}
        </p>
        <p className="mt-1 truncate text-[11.5px] text-[color:var(--ink-4)]">{hint}</p>
      </div>
      <p
        className="num shrink-0 whitespace-nowrap text-right text-[22px] font-semibold tracking-[-0.03em]"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

export function MiniStatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
        {label}
      </p>
      <p className="num mt-1 text-[20px] font-semibold">{value}</p>
      <p className="mt-1 text-[11.5px] text-[color:var(--ink-4)]">{hint}</p>
    </div>
  );
}

export function FactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
        {label}
      </p>
      <p className="num mt-1 text-[13px] font-semibold">{value}</p>
    </div>
  );
}

export function BrandMeter({
  label,
  value,
  max,
  gradient,
  formatValue,
  hideValue = false,
  trackClassName = "bg-[rgba(13,17,35,0.08)]",
}: {
  label?: string;
  value: number;
  max: number;
  gradient: string;
  formatValue?: (value: number) => string;
  hideValue?: boolean;
  trackClassName?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      {(label || !hideValue) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12px]">
          {label && <span className="font-medium text-[color:var(--ink-4)]">{label}</span>}
          {!hideValue && (
            <span className="num font-semibold">
              {formatValue ? formatValue(value) : `${pct.toFixed(0)}%`}
            </span>
          )}
        </div>
      )}
      <div className={`relative h-3 overflow-hidden rounded-full ${trackClassName}`}>
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${pct}%`,
            backgroundImage: gradient,
            boxShadow: "0 0 18px rgba(252,76,2,0.16)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.42) 50%, transparent 82%)",
          }}
        />
      </div>
    </div>
  );
}

// ── Pills ────────────────────────────────────────────────────────────────────

export function LifecycleDetailPill({ stage }: { stage: string }) {
  return (
    <span
      className="inline-flex h-[26px] w-[92px] items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{ backgroundColor: lifecycleColor(stage) }}
    >
      {stage}
    </span>
  );
}

export function SolidDetailPill({
  children,
  color,
  dot = false,
}: {
  children: ReactNode;
  color: string;
  dot?: boolean;
}) {
  return (
    <span
      className="inline-flex h-[26px] items-center justify-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-white/90" /> : null}
      {children}
    </span>
  );
}

export function HighValueMedal() {
  return (
    <img
      src="/assets/images/achievement-award-medal-icon.svg"
      alt="High value customer"
      className="h-6 w-6 shrink-0"
    />
  );
}

// ── Signals section ──────────────────────────────────────────────────────────

export function SignalRow({
  icon: Icon,
  label,
  value,
  meterValue,
  gradient,
  accentColor = MOBY_BRAND.blue,
}: {
  icon: ElementType;
  label: string;
  value: string;
  meterValue: number;
  gradient: string;
  accentColor?: string;
}) {
  return (
    <div className="rounded-[24px] border border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-[color:var(--ink-1)]">{label}</p>
          <p className="num mt-2 whitespace-nowrap text-[26px] font-semibold tracking-[-0.04em]">
            {value}
          </p>
        </div>
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-gray-50"
          style={{ color: accentColor }}
        >
          <Icon size={17} />
        </span>
      </div>
      <BrandMeter value={meterValue} max={100} gradient={gradient} hideValue />
    </div>
  );
}

// ── Reasoning section ─────────────────────────────────────────────────────────

function ReasonSection({
  label,
  order,
  children,
}: {
  label: string;
  order: number;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-gray-100 text-[10px] font-bold text-[color:var(--ink-4)]">
          {order}
        </span>
        <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-[color:var(--ink-5)]">
          {label}
        </h3>
      </div>
      {children}
    </div>
  );
}

export function ReasoningStack({ customer }: { customer: CustomerDetail }) {
  const { drivers, narrative } = composeReasoning(customer);
  return (
    <div className="space-y-5">
      {drivers.length > 0 && (
        <ReasonSection label="ปัจจัยจากโมเดล" order={1}>
          <ul className="space-y-2">
            {drivers.map((driver) => (
              <li
                key={driver.label}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2"
              >
                <span className="flex items-center gap-2 text-[12.5px] text-[color:var(--ink-2)]">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-lg"
                    style={{
                      backgroundColor:
                        driver.direction === "up" ? "rgba(252,76,2,0.12)" : "rgba(0,107,255,0.12)",
                      color: driver.direction === "up" ? CHURN_COLOR : MOBY_BRAND.blue,
                    }}
                  >
                    {driver.direction === "up" ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  </span>
                  {driver.label}
                </span>
                <span className="num text-[12.5px] font-semibold text-[color:var(--ink-1)]">
                  {driver.valueText}
                </span>
              </li>
            ))}
          </ul>
        </ReasonSection>
      )}

      <ReasonSection label="บทวิเคราะห์ AI" order={2}>
        {narrative.kind === "ready" ? (
          <div className="text-[13px] leading-6 text-[color:var(--ink-3)]">
            <MarkdownLite text={narrative.text} strongClassName="font-semibold text-[color:var(--ink-1)]" />
          </div>
        ) : (
          <p className="text-[13px] leading-6 text-[color:var(--ink-5)]">{narrative.text}</p>
        )}
      </ReasonSection>
    </div>
  );
}

// ── Utilities ────────────────────────────────────────────────────────────────

export function lifecycleColor(stage: string): string {
  if (stage === "Active Paid") return "#006bff";
  if (stage === "Active Free") return "#ffa400";
  if (stage === "Churned") return "#fc4c02";
  return "#9ca3af";
}

export function isHighValueTier(tier: string | null): boolean {
  return (tier ?? "").toLowerCase().includes("high");
}

export { CHURN_COLOR, CHURN_GRADIENT, BLUE_GRADIENT };

// Re-export icon refs used in the main view's SignalRow calls
export { TrendingDown, Gem, CreditCard };
