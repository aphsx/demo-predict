"use client";

import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import {
  ArrowLeft,
  CreditCard,
  Gem,
  MessageSquareText,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import { StatusPill, lifecycleTone } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { MOBY_BRAND } from "@/lib/login-brand-colors";

/** Subset of ML output fields shown on /customers/[id] (nullable = model not eligible). */
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
  ai_status: string;
  ai_explanation: string | null;
  ai_recommended_message: string | null;
  output_status: string;
};

export type UsageTrendPoint = {
  month: string;
  usage: number;
};

const BLUE_GRADIENT = `linear-gradient(90deg, ${MOBY_BRAND.blue} 0%, ${MOBY_BRAND.blueLight} 100%)`;

export function CustomerDetailView({
  accId,
  customer,
  usageTrend,
}: {
  accId: string;
  customer: CustomerDetail;
  usageTrend: UsageTrendPoint[];
}) {
  const churnPct = customer.churn_probability != null ? customer.churn_probability * 100 : null;
  // Spec §5: render the AI card only when ai_status === 'completed' — never an empty/mock card.
  const showAiPanel = customer.ai_status === "completed" && customer.ai_explanation != null;

  return (
    <main className="px-8 py-6 pb-12">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[.16em] text-[color:var(--ink-5)] hover:text-[color:var(--moby-600)]"
      >
        <ArrowLeft size={11} /> Customers
      </Link>

      <section className="mt-4 space-y-5">
        <div
          className={`grid grid-cols-1 gap-5 ${
            showAiPanel
              ? "xl:grid-cols-[390px_minmax(0,1fr)_340px]"
              : "xl:grid-cols-[390px_minmax(0,1fr)]"
          }`}
        >
          <Panel title={`Account ${accId}`}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={lifecycleTone(customer.lifecycle_stage)}>
                  {customer.lifecycle_stage}
                </StatusPill>
                <StatusPill tone="neutral" dot={false}>{customer.sub_stage}</StatusPill>
                {customer.churn_risk_level && (
                  <StatusPill tone="danger">{customer.churn_risk_level} churn risk</StatusPill>
                )}
              </div>

              <div className="space-y-3">
                <HeroMetric
                  label="Churn"
                  value={churnPct != null ? `${churnPct.toFixed(1)}%` : "—"}
                  hint={customer.churn_risk_level ?? "not eligible"}
                />
                <HeroMetric
                  label="CLV 6m"
                  value={customer.predicted_clv_6m != null ? formatCurrency(customer.predicted_clv_6m) : "—"}
                  hint={customer.customer_value_tier}
                />
                <HeroMetric
                  label="Revenue risk"
                  value={customer.revenue_at_risk != null ? formatCurrency(customer.revenue_at_risk) : "—"}
                  hint="at risk"
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

          <Panel title="Usage trend (actual)">
            <div className="space-y-4">
              {usageTrend.length > 0 ? (
                <UsageLineChart data={usageTrend} compact />
              ) : (
                <p className="rounded-[24px] border border-gray-200 bg-white p-4 text-[13px] text-[color:var(--ink-4)]">
                  ไม่มีข้อมูล usage ของลูกค้ารายนี้
                </p>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MiniStatCard label="Latest usage" value={usageTrend.at(-1)?.usage.toLocaleString() ?? "—"} hint={`${usageTrend.at(-1)?.month ?? ""} credits`} />
                <MiniStatCard
                  label="Peak usage"
                  value={
                    usageTrend.length > 0
                      ? Math.max(...usageTrend.map((point) => point.usage)).toLocaleString()
                      : "—"
                  }
                  hint="last 12 months"
                />
                <MiniStatCard
                  label="Inactive"
                  value={customer.days_since_last_activity != null ? `${customer.days_since_last_activity}d` : "—"}
                  hint="since last activity (นับจาก cutoff)"
                />
              </div>
            </div>
          </Panel>

          {showAiPanel && (
            <Panel title="Reason and message">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone="ok">{customer.ai_status}</StatusPill>
                </div>

                <div className="rounded-[24px] border border-gray-200 bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[color:var(--ink-1)]">
                    <Sparkles size={14} /> Why now
                  </div>
                  <p className="text-[13px] leading-6 text-[color:var(--ink-3)]">
                    {customer.ai_explanation}
                  </p>
                </div>

                {customer.ai_recommended_message && (
                  <div className="rounded-[24px] border border-[color:var(--moby-100)] bg-[color:var(--moby-50)] p-4">
                    <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[color:var(--moby-600)]">
                      <MessageSquareText size={14} /> Suggested message
                    </div>
                    <p className="text-[12.5px] leading-6 text-[color:var(--ink-3)]">
                      {customer.ai_recommended_message}
                    </p>
                  </div>
                )}
              </div>
            </Panel>
          )}
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
                gradient={BLUE_GRADIENT}
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

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="surface-elev overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-[20px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)]">
          {title}
        </h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function HeroMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[22px] border border-gray-200 bg-white/80 px-4 py-3.5 shadow-[var(--shadow-1)]">
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
          {label}
        </p>
        <p className="mt-1 truncate text-[11.5px] text-[color:var(--ink-4)]">{hint}</p>
      </div>
      <p className="num shrink-0 whitespace-nowrap text-right text-[22px] font-semibold tracking-[-0.03em]">
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
}: {
  icon: ElementType;
  label: string;
  value: string;
  meterValue: number;
  gradient: string;
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
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-gray-50 text-[color:var(--moby-600)]">
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

function usageOrangeColor(normalizedValue: number): string {
  const pct = Math.max(0, Math.min(1, normalizedValue));
  const low = { r: 255, g: 164, b: 0 };
  const high = { r: 252, g: 76, b: 2 };
  const r = Math.round(low.r + (high.r - low.r) * pct);
  const g = Math.round(low.g + (high.g - low.g) * pct);
  const b = Math.round(low.b + (high.b - low.b) * pct);

  return `rgb(${r}, ${g}, ${b})`;
}
