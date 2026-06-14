"use client";

import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CreditCard,
  Gem,
  TrendingDown,
} from "lucide-react";
import { MarkdownLite } from "@/components/chat/MarkdownLite";
import { formatCurrency } from "@/lib/format";
import { MOBY_BRAND } from "@/lib/login-brand-colors";
import type { ChurnFactor } from "@/lib/mlApi";
import { composeReasoning, type ReasoningLayer } from "./reasoning";

export type CustomerDetail = {
  lifecycle_stage: string;
  sub_stage: string;
  churn_probability: number | null;
  churn_risk_level: string | null;
  predicted_clv_6m: number | null;
  customer_value_tier: string;
  revenue_at_risk: number | null;
  predicted_credit_usage_30d: number | null;
  predicted_credit_usage_90d: number | null;
  estimated_days_until_topup: number | null;
  credit_urgency_level: string | null;
  usage_trend: string;
  days_since_last_activity: number | null;
  n_purchases: number;
  total_revenue: number;
  avg_transaction_value: number | null;
  ever_paid: boolean;
  priority_reason: string;
  segment: string;
  churn_factors: ChurnFactor[] | null;
  ai_status: "not_requested" | "pending" | "completed" | "failed";
  ai_explanation: string | null;
  output_status: string;
};

export type UsageTrendPoint = {
  month: string;
  usage: number;
};

const SEGMENT_HINT: Record<string, string> = {
  retain_now: "รีบติดต่อรักษา",
  protect: "ดูแลความสัมพันธ์",
  rescue_or_let_go: "win-back ต้นทุนต่ำ",
  monitor: "เฝ้าดูตามรอบ",
};
const CHURN_COLOR = "#fc4c02";
const CHURN_GRADIENT = `linear-gradient(90deg, ${MOBY_BRAND.orangeWarm} 0%, ${CHURN_COLOR} 100%)`;
const BLUE_GRADIENT = `linear-gradient(90deg, ${MOBY_BRAND.blue} 0%, ${MOBY_BRAND.blueLight} 100%)`;

export function CustomerDetailView({
  accId,
  customer,
  usageTrend,
  runId,
  customersHref,
}: {
  accId: string;
  customer: CustomerDetail;
  usageTrend: UsageTrendPoint[];
  runId?: string;
  customersHref?: string;
}) {
  const churnPct = customer.churn_probability != null ? customer.churn_probability * 100 : null;
  const reasoning = composeReasoning(customer);
  const latestUsage = usageTrend.at(-1);
  const peakUsage = usageTrend.length > 0 ? Math.max(...usageTrend.map((point) => point.usage)) : null;
  const showSubStage =
    Boolean(customer.sub_stage) && customer.sub_stage !== customer.lifecycle_stage;
  const customerListHref = customersHref ?? (runId ? `/customers?run=${encodeURIComponent(runId)}` : "/customers");

  return (
    <main className="px-8 py-6 pb-12">
      <Link
        href={customerListHref}
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[.16em] text-[color:var(--ink-5)] hover:text-[color:var(--moby-600)]"
      >
        <ArrowLeft size={11} /> Customers
      </Link>

      <section className="mt-4 space-y-5">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[390px_minmax(0,1fr)_340px] xl:items-start">
          <Panel title={`Account ${accId}`}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {isHighValueTier(customer.customer_value_tier) ? <HighValueMedal /> : null}
                <LifecycleDetailPill stage={customer.lifecycle_stage} />
                {showSubStage && (
                  <SolidDetailPill color="#9ca3af">
                    {customer.sub_stage}
                  </SolidDetailPill>
                )}
                {customer.churn_risk_level && (
                  <SolidDetailPill color={CHURN_COLOR} dot>
                    {customer.churn_risk_level} churn risk
                  </SolidDetailPill>
                )}
              </div>

              <div className="space-y-3">
                <HeroMetric
                  label="Churn"
                  value={churnPct != null ? `${churnPct.toFixed(1)}%` : "—"}
                  hint={customer.churn_risk_level ?? "not eligible"}
                  valueColor={CHURN_COLOR}
                />
                <HeroMetric
                  label="CLV 6m"
                  value={customer.predicted_clv_6m != null ? formatCurrency(customer.predicted_clv_6m) : "—"}
                  hint={customer.customer_value_tier}
                />
                <HeroMetric
                  label="Revenue risk"
                  value={customer.revenue_at_risk != null ? formatCurrency(customer.revenue_at_risk) : "—"}
                  hint={SEGMENT_HINT[customer.segment] ?? "at risk"}
                />
                <HeroMetric
                  label="Top-up risk"
                  value={
                    customer.estimated_days_until_topup != null
                      ? `${customer.estimated_days_until_topup}d`
                      : "—"
                  }
                  hint={customer.credit_urgency_level ?? "ข้อมูลไม่พอประเมิน"}
                />
              </div>
            </div>
          </Panel>

          <Panel title="การใช้งาน Credit">
            <div className="space-y-4">
              {usageTrend.length > 0 ? (
                <UsageLineChart data={usageTrend} compact />
              ) : (
                <div className="rounded-[24px] border border-gray-200 bg-white p-6 text-center text-[13px] text-[color:var(--ink-4)]">
                  ไม่มีข้อมูล usage สำหรับ account นี้
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MiniStatCard
                  label="Latest usage"
                  value={latestUsage?.usage.toLocaleString() ?? "—"}
                  hint={latestUsage ? `${latestUsage.month} credits` : "ไม่มีข้อมูล usage"}
                />
                <MiniStatCard
                  label="Peak usage"
                  value={peakUsage != null ? peakUsage.toLocaleString() : "—"}
                  hint="last 6 months"
                />
                <MiniStatCard
                  label="Inactive"
                  value={
                    customer.days_since_last_activity != null
                      ? `${customer.days_since_last_activity}d`
                      : "—"
                  }
                  hint="since last activity"
                />
              </div>
            </div>
          </Panel>

          <div className="flex min-h-0 max-h-[min(28rem,55vh)] flex-col self-stretch xl:max-h-none">
            <Panel
              title="เหตุผล"
              className="flex min-h-0 flex-1 flex-col"
              bodyClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              <ReasoningStack reasoning={reasoning} />
            </Panel>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <Panel title="Compact profile">
            <div className="grid grid-cols-2 gap-3">
              <FactCard label="Lifecycle" value={customer.lifecycle_stage} />
              <FactCard label="Purchases" value={customer.n_purchases.toLocaleString()} />
              <FactCard label="Total revenue" value={formatCurrency(customer.total_revenue)} />
              <FactCard
                label="Avg txn"
                value={customer.avg_transaction_value != null ? formatCurrency(customer.avg_transaction_value) : "—"}
              />
            </div>
          </Panel>

          <Panel title="What changed the decision">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <SignalRow
                icon={TrendingDown}
                label="Churn pressure"
                value={churnPct != null ? `${churnPct.toFixed(1)}%` : "—"}
                meterValue={churnPct ?? 0}
                gradient={CHURN_GRADIENT}
                accentColor={CHURN_COLOR}
              />
              <SignalRow
                icon={Gem}
                label="Commercial value"
                value={customer.predicted_clv_6m != null ? formatCurrency(customer.predicted_clv_6m) : "—"}
                meterValue={customer.predicted_clv_6m != null ? 78 : 0}
                gradient={BLUE_GRADIENT}
              />
              <SignalRow
                icon={CreditCard}
                label="Credit demand"
                value={
                  customer.predicted_credit_usage_90d != null
                    ? customer.predicted_credit_usage_90d.toLocaleString()
                    : "—"
                }
                meterValue={customer.predicted_credit_usage_90d != null ? 100 : 0}
                gradient={BLUE_GRADIENT}
              />
            </div>
          </Panel>
        </div>
      </section>
    </main>
  );
}

function ReasoningStack({ reasoning }: { reasoning: ReasoningLayer }) {
  const { headline, drivers, narrative } = reasoning;
  return (
    <div className="space-y-5">
      {headline && (
        <ReasonSection label="ทำไมต้องสนใจ" order={1}>
          <p className="text-[13px] leading-6 text-[color:var(--ink-2)]">{headline}</p>
        </ReasonSection>
      )}

      {drivers.length > 0 && (
        <ReasonSection label="ปัจจัยจากโมเดล" order={2}>
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

      <ReasonSection label="บทวิเคราะห์ AI" order={3}>
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

function Panel({
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

function HeroMetric({
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

function UsageLineChart({
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

function SignalRow({
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

function MiniStatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
        {label}
      </p>
      <p className="num mt-1 text-[20px] font-semibold">
        {value}
      </p>
      <p className="mt-1 text-[11.5px] text-[color:var(--ink-4)]">
        {hint}
      </p>
    </div>
  );
}

function BrandMeter({
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

function FactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
        {label}
      </p>
      <p className="num mt-1 text-[13px] font-semibold">
        {value}
      </p>
    </div>
  );
}

function LifecycleDetailPill({ stage }: { stage: string }) {
  return (
    <span
      className="inline-flex h-[26px] w-[92px] items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{ backgroundColor: lifecycleColor(stage) }}
    >
      {stage}
    </span>
  );
}

function SolidDetailPill({
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

function lifecycleColor(stage: string): string {
  if (stage === "Active Paid") return "#006bff";
  if (stage === "Active Free") return "#ffa400";
  if (stage === "Churned") return "#fc4c02";
  if (stage === "Ghost") return "#9ca3af";
  return "#9ca3af";
}

function isHighValueTier(tier: string | null): boolean {
  return (tier ?? "").toLowerCase().includes("high");
}

function HighValueMedal() {
  return (
    <img
      src="/assets/images/achievement-award-medal-icon.svg"
      alt="High value customer"
      className="h-6 w-6 shrink-0"
    />
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
