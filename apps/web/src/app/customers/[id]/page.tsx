"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ElementType, ReactNode } from "react";
import {
  ArrowLeft,
  CreditCard,
  Gem,
  MessageSquareText,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";
import { StatusPill, lifecycleTone } from "@/components/ui";
import { MOBY_BRAND } from "@/lib/login-brand-colors";

const BRAND_GRADIENT = `linear-gradient(90deg, ${MOBY_BRAND.blue} 0%, ${MOBY_BRAND.blueLight} 48%, ${MOBY_BRAND.orangeWarm} 76%, ${MOBY_BRAND.orange} 100%)`;
const ORANGE_GRADIENT = `linear-gradient(90deg, ${MOBY_BRAND.orangeWarm} 0%, ${MOBY_BRAND.orange} 100%)`;
const BLUE_GRADIENT = `linear-gradient(90deg, ${MOBY_BRAND.blue} 0%, ${MOBY_BRAND.blueLight} 100%)`;

const MOCK_CUSTOMER = {
  lifecycle_stage: "Active Paid",
  sub_stage: "At-risk paid",
  churn_probability: 0.68,
  churn_risk_level: "High",
  predicted_clv_6m: 42800,
  customer_value_tier: "High value",
  revenue_at_risk: 29104,
  predicted_credit_usage_30d: 18450,
  predicted_credit_usage_90d: 56100,
  estimated_days_until_topup: 9,
  credit_urgency_level: "Warning",
  usage_trend: "Declining",
  days_since_last_activity: 18,
  n_purchases: 7,
  total_revenue: 126400,
  avg_transaction_value: 18057,
  ever_paid: true,
  priority_score: 87,
  priority_reason: "High CLV customer with declining usage and near-term top-up risk.",
  recommended_action: "Call customer success owner and offer usage review package.",
  recommended_followup_date: "2026-06-12",
  ai_status: "generated",
  ai_explanation:
    "ลูกค้ารายนี้ยังเป็น Active Paid และมีมูลค่าสูง แต่ usage trend ลดลงต่อเนื่อง ประกอบกับวันล่าสุดที่ใช้งานเริ่มห่าง จึงควรติดต่อก่อนถึงรอบเติมเครดิตถัดไป",
  ai_recommended_message:
    "สวัสดีครับ ทีม 1Moby เห็นว่า usage ช่วงนี้ลดลงเล็กน้อย อยากช่วยรีวิวแคมเปญและเครดิตที่เหลือ เพื่อให้รอบส่งถัดไปราบรื่นขึ้นครับ",
  ai_model: "gemini-pro",
  output_status: "predicted",
} as const;

export default function Customer360Mockup() {
  const params = useParams();
  const accId = String(params.id ?? "10001");
  const churnPct = MOCK_CUSTOMER.churn_probability * 100;

  return (
    <main className="px-8 py-6 pb-12 space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/customers"
            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[.16em] text-[color:var(--ink-5)] hover:text-[color:var(--moby-700)]"
          >
            <ArrowLeft size={11} /> Customers
          </Link>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-5)]">
            Customer 360
          </p>
          <h1 className="mt-1 text-[34px] font-semibold leading-tight tracking-[-0.045em] text-[color:var(--ink-1)]">
            Account {accId}
          </h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusPill tone={lifecycleTone(MOCK_CUSTOMER.lifecycle_stage)}>
            {MOCK_CUSTOMER.lifecycle_stage}
          </StatusPill>
          <StatusPill tone="neutral" dot={false}>{MOCK_CUSTOMER.sub_stage}</StatusPill>
          <StatusPill tone="danger">{MOCK_CUSTOMER.churn_risk_level} churn risk</StatusPill>
          <StatusPill tone="neutral" dot={false}>Mockup</StatusPill>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={TrendingDown}
          label="Churn probability"
          value={`${churnPct.toFixed(1)}%`}
          hint={`${MOCK_CUSTOMER.churn_risk_level} risk · ${MOCK_CUSTOMER.usage_trend}`}
          color="var(--danger)"
        />
        <MetricCard
          icon={Gem}
          label="Predicted CLV"
          value={formatCurrency(MOCK_CUSTOMER.predicted_clv_6m)}
          hint={MOCK_CUSTOMER.customer_value_tier}
          color={MOBY_BRAND.blue}
        />
        <MetricCard
          icon={CreditCard}
          label="Credit forecast"
          value={MOCK_CUSTOMER.predicted_credit_usage_90d.toLocaleString()}
          hint={`${MOCK_CUSTOMER.estimated_days_until_topup} days until top-up`}
          color={MOBY_BRAND.orange}
        />
        <MetricCard
          icon={Gem}
          label="Revenue at risk"
          value={formatCurrency(MOCK_CUSTOMER.revenue_at_risk)}
          hint={`จาก total revenue ${formatCurrency(MOCK_CUSTOMER.total_revenue)}`}
          color={MOBY_BRAND.orangeWarm}
        />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
        <Panel eyebrow="Risk profile" title="Prediction signals">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
            <div className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--surface-2)] p-4">
              <RiskDial value={MOCK_CUSTOMER.churn_probability} />
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[color:var(--line-2)] pt-4">
                <MiniStat label="Inactive" value={`${MOCK_CUSTOMER.days_since_last_activity}d`} />
                <MiniStat label="Purchases" value={MOCK_CUSTOMER.n_purchases.toLocaleString()} />
              </div>
            </div>

            <div className="space-y-4">
              <SignalRow
                label="Churn risk"
                value={`${churnPct.toFixed(1)}%`}
                hint="probability in next 6 months"
                meterValue={churnPct}
                gradient={ORANGE_GRADIENT}
              />
              <SignalRow
                label="Revenue at risk"
                value={formatCurrency(MOCK_CUSTOMER.revenue_at_risk)}
                hint={`จาก total revenue ${formatCurrency(MOCK_CUSTOMER.total_revenue)}`}
                meterValue={(MOCK_CUSTOMER.revenue_at_risk / MOCK_CUSTOMER.total_revenue) * 100}
                gradient={ORANGE_GRADIENT}
              />
              <SignalRow
                label="Predicted CLV"
                value={formatCurrency(MOCK_CUSTOMER.predicted_clv_6m)}
                hint={`${MOCK_CUSTOMER.customer_value_tier} · avg txn ${formatCurrency(MOCK_CUSTOMER.avg_transaction_value)}`}
                meterValue={78}
                gradient={BLUE_GRADIENT}
              />
              <SignalRow
                label="90d credit usage"
                value={MOCK_CUSTOMER.predicted_credit_usage_90d.toLocaleString()}
                hint={`30d forecast ${MOCK_CUSTOMER.predicted_credit_usage_30d.toLocaleString()}`}
                meterValue={100}
                gradient={BRAND_GRADIENT}
              />
            </div>
          </div>
        </Panel>

        <Panel eyebrow="AI reason" title="Generated context">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="ok">{MOCK_CUSTOMER.ai_status}</StatusPill>
              <StatusPill tone="neutral" dot={false}>{MOCK_CUSTOMER.ai_model}</StatusPill>
            </div>

            <div className="rounded-[24px] border border-[color:var(--line)] bg-white p-4">
              <p className="text-[13px] leading-6 text-[color:var(--ink-3)]">
                {MOCK_CUSTOMER.ai_explanation}
              </p>
            </div>

            <div className="rounded-[24px] border border-[color:var(--moby-100)] bg-[color:var(--moby-50)] p-4">
              <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[color:var(--moby-700)]">
                <MessageSquareText size={14} /> Suggested message
              </div>
              <p className="text-[12.5px] leading-6 text-[color:var(--ink-3)]">
                {MOCK_CUSTOMER.ai_recommended_message}
              </p>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel eyebrow="Credit forecast" title="Top-up timing">
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-[24px] border border-[color:var(--line)] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
                  30d usage
                </p>
                <p className="num mt-1 text-[24px] font-semibold text-[color:var(--ink-1)]">
                  {MOCK_CUSTOMER.predicted_credit_usage_30d.toLocaleString()}
                </p>
                <div className="mt-3">
                  <BrandMeter
                    value={MOCK_CUSTOMER.predicted_credit_usage_30d}
                    max={MOCK_CUSTOMER.predicted_credit_usage_90d}
                    gradient={BLUE_GRADIENT}
                    hideValue
                  />
                </div>
              </div>

              <div className="rounded-[24px] border border-[color:var(--line)] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
                  90d usage
                </p>
                <p className="num mt-1 text-[24px] font-semibold text-[color:var(--ink-1)]">
                  {MOCK_CUSTOMER.predicted_credit_usage_90d.toLocaleString()}
                </p>
                <div className="mt-3">
                  <BrandMeter
                    value={MOCK_CUSTOMER.predicted_credit_usage_90d}
                    max={MOCK_CUSTOMER.predicted_credit_usage_90d}
                    gradient={BRAND_GRADIENT}
                    hideValue
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-4 text-[12.5px] leading-6 text-[color:var(--ink-4)]">
              เหลือประมาณ <b className="num text-[color:var(--ink-1)]">{MOCK_CUSTOMER.estimated_days_until_topup} วัน</b> ก่อนถึงรอบเติมเครดิตถัดไป จาก forecast credit usage ปัจจุบัน
            </div>
          </div>
        </Panel>

        <Panel eyebrow="Customer data" title="Snapshot">
          <div className="grid grid-cols-2 gap-3">
            <FactCard label="Lifecycle" value={MOCK_CUSTOMER.lifecycle_stage} />
            <FactCard label="Ever paid" value={MOCK_CUSTOMER.ever_paid ? "Yes" : "No"} />
            <FactCard label="Purchases" value={MOCK_CUSTOMER.n_purchases.toLocaleString()} />
            <FactCard label="Inactive" value={`${MOCK_CUSTOMER.days_since_last_activity}d`} />
            <FactCard label="Total revenue" value={formatCurrency(MOCK_CUSTOMER.total_revenue)} />
            <FactCard label="Avg txn" value={formatCurrency(MOCK_CUSTOMER.avg_transaction_value)} />
          </div>
        </Panel>
      </section>

      <section className="surface p-4">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[color:var(--ink-5)]">
          <ShieldCheck size={12} /> Mockup from ML v2 prediction output fields
          <span className="opacity-50">·</span>
          lifecycle / churn / clv / credit / ai
          <span className="opacity-50">·</span>
          API not connected
        </div>
      </section>
    </main>
  );
}

function Panel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="surface-elev overflow-hidden">
      <div className="border-b border-[color:var(--line-2)] px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-5)]">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)]">
          {title}
        </h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  color,
}: {
  icon: ElementType;
  label: string;
  value: string;
  hint: string;
  color: string;
}) {
  return (
    <div className="surface-elev relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-5)]">
            {label}
          </div>
          <div className="num mt-1.5 text-[24px] font-semibold tracking-[-0.03em] text-[color:var(--ink-1)]">
            {value}
          </div>
          <div className="mt-1 text-[11.5px] text-[color:var(--ink-4)]">{hint}</div>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[color:var(--surface-2)]" style={{ color }}>
          <Icon size={18} />
        </span>
      </div>
    </div>
  );
}

function RiskDial({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const color = pct >= 0.6 ? MOBY_BRAND.orange : pct >= 0.35 ? MOBY_BRAND.orangeWarm : MOBY_BRAND.blueLight;
  return (
    <div className="text-center">
      <div
        className="mx-auto grid h-[154px] w-[154px] place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(13,17,35,0.06)]"
        style={{
          background: `conic-gradient(${color} ${pct * 360}deg, rgba(13,17,35,0.08) 0deg)`,
        }}
      >
        <div className="grid h-[116px] w-[116px] place-items-center rounded-full bg-white shadow-[var(--shadow-1)]">
          <div>
            <div className="num text-[32px] font-semibold leading-none" style={{ color }}>
              {(pct * 100).toFixed(1)}%
            </div>
            <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[.14em] text-[color:var(--ink-5)]">
              churn
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-center">
        <StatusPill tone="danger">{MOCK_CUSTOMER.churn_risk_level} risk</StatusPill>
      </div>
    </div>
  );
}

function SignalRow({
  label,
  value,
  hint,
  meterValue,
  gradient,
}: {
  label: string;
  value: string;
  hint: string;
  meterValue: number;
  gradient: string;
}) {
  return (
    <div className="rounded-[22px] border border-[color:var(--line)] bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-[color:var(--ink-1)]">{label}</p>
          <p className="mt-0.5 text-[11.5px] text-[color:var(--ink-4)]">{hint}</p>
        </div>
        <div className="num text-right text-[17px] font-semibold text-[color:var(--ink-1)]">{value}</div>
      </div>
      <BrandMeter value={meterValue} max={100} gradient={gradient} hideValue />
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
            <span className="num font-semibold text-[color:var(--ink-2)]">
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">{label}</p>
      <p className="num mt-1 text-[18px] font-semibold text-[color:var(--ink-1)]">{value}</p>
    </div>
  );
}

function FactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-white p-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
        {label}
      </p>
      <p className="num mt-1 text-[13px] font-semibold text-[color:var(--ink-1)]">
        {value}
      </p>
    </div>
  );
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString()} ฿`;
}
