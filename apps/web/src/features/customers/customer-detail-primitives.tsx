"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { MarkdownLite } from "@/components/chat/markdown-lite";
import { MOBY_BRAND } from "@/lib/login-brand-colors";
import { composeReasoning } from "./reasoning";
import type { CustomerDetail } from "./customer-detail-view";

const CHURN_COLOR = "#fc4c02";

// ── Layout ──────────────────────────────────────────────────────────────────

export function Panel({
  title,
  headerRight,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`surface-elev flex min-h-0 flex-col overflow-hidden ${className ?? ""}`}>
      <div className="shrink-0 border-b border-gray-100 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="text-[20px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)]">
            {title}
          </h2>
          {headerRight ? (
            <div className="flex flex-wrap items-center justify-end gap-1">{headerRight}</div>
          ) : null}
        </div>
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

      <ReasonSection label="สรุปพฤติกรรม (AI)" order={2}>
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

export { CHURN_COLOR };
