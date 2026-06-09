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
  Sparkles,
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
  ai_status: "generated",
  ai_explanation:
    "ลูกค้ารายนี้ยังเป็น Active Paid และมีมูลค่าสูง แต่ usage trend ลดลงต่อเนื่อง ประกอบกับวันล่าสุดที่ใช้งานเริ่มห่าง จึงควรติดต่อก่อนถึงรอบเติมเครดิตถัดไป",
  ai_recommended_message:
    "สวัสดีครับ ทีม 1Moby เห็นว่า usage ช่วงนี้ลดลงเล็กน้อย อยากช่วยรีวิวแคมเปญและเครดิตที่เหลือ เพื่อให้รอบส่งถัดไปราบรื่นขึ้นครับ",
  ai_model: "gemini-pro",
  output_status: "predicted",
} as const;

const USAGE_TREND = [
  { month: "Jan", usage: 64200 },
  { month: "Feb", usage: 61800 },
  { month: "Mar", usage: 58400 },
  { month: "Apr", usage: 51200 },
  { month: "May", usage: 43800 },
  { month: "Jun", usage: 36100 },
] as const;

export default function Customer360Mockup() {
  const params = useParams();
  const accId = String(params.id ?? "10001");
  const churnPct = MOCK_CUSTOMER.churn_probability * 100;

  return (
    <main className="px-8 py-6 pb-12">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[.16em] text-[color:var(--ink-5)] hover:text-[color:var(--moby-700)]"
      >
        <ArrowLeft size={11} /> Customers
      </Link>

      <section className="mt-4 space-y-5">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[390px_minmax(0,1fr)_340px]">
          <Panel title={`Account ${accId}`}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={lifecycleTone(MOCK_CUSTOMER.lifecycle_stage)}>
                  {MOCK_CUSTOMER.lifecycle_stage}
                </StatusPill>
                <StatusPill tone="neutral" dot={false}>{MOCK_CUSTOMER.sub_stage}</StatusPill>
                <StatusPill tone="danger">{MOCK_CUSTOMER.churn_risk_level} churn risk</StatusPill>
              </div>

              <div className="space-y-3">
                <HeroMetric label="Churn" value={`${churnPct.toFixed(1)}%`} hint={MOCK_CUSTOMER.churn_risk_level} />
                <HeroMetric label="CLV 6m" value={formatCurrency(MOCK_CUSTOMER.predicted_clv_6m)} hint={MOCK_CUSTOMER.customer_value_tier} />
                <HeroMetric label="Revenue risk" value={formatCurrency(MOCK_CUSTOMER.revenue_at_risk)} hint="at risk" />
                <HeroMetric label="Top-up risk" value={`${MOCK_CUSTOMER.estimated_days_until_topup}d`} hint={MOCK_CUSTOMER.credit_urgency_level} />
              </div>
            </div>
          </Panel>

          <Panel title="Declining activity is the main warning">
            <div className="space-y-4">
              <UsageLineChart data={USAGE_TREND} compact />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MiniStatCard label="Latest usage" value={USAGE_TREND.at(-1)?.usage.toLocaleString() ?? "—"} hint="Jun credits" />
                <MiniStatCard label="Peak usage" value={Math.max(...USAGE_TREND.map((point) => point.usage)).toLocaleString()} hint="last 6 months" />
                <MiniStatCard label="Inactive" value={`${MOCK_CUSTOMER.days_since_last_activity}d`} hint="since last activity" />
              </div>
            </div>
          </Panel>

          <Panel title="Reason and message">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="ok">{MOCK_CUSTOMER.ai_status}</StatusPill>
                <StatusPill tone="neutral" dot={false}>{MOCK_CUSTOMER.ai_model}</StatusPill>
                <StatusPill tone="neutral" dot={false}>Mockup</StatusPill>
              </div>

              <div className="rounded-[24px] border border-[color:var(--line)] bg-white p-4">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[color:var(--ink-1)]">
                  <Sparkles size={14} /> Why now
                </div>
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
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <Panel title="Compact profile">
            <div className="grid grid-cols-2 gap-3">
              <FactCard label="Lifecycle" value={MOCK_CUSTOMER.lifecycle_stage} />
              <FactCard label="Purchases" value={MOCK_CUSTOMER.n_purchases.toLocaleString()} />
              <FactCard label="Total revenue" value={formatCurrency(MOCK_CUSTOMER.total_revenue)} />
              <FactCard label="Avg txn" value={formatCurrency(MOCK_CUSTOMER.avg_transaction_value)} />
              <FactCard label="Ever paid" value={MOCK_CUSTOMER.ever_paid ? "Yes" : "No"} />
              <FactCard label="Output" value={MOCK_CUSTOMER.output_status} />
            </div>
          </Panel>

          <Panel title="What changed the decision">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <SignalRow
                icon={TrendingDown}
                label="Churn pressure"
                value={`${churnPct.toFixed(1)}%`}
                hint="High risk because usage is falling while the customer remains paid."
                meterValue={churnPct}
                gradient={ORANGE_GRADIENT}
              />
              <SignalRow
                icon={Gem}
                label="Commercial value"
                value={formatCurrency(MOCK_CUSTOMER.predicted_clv_6m)}
                hint={`${MOCK_CUSTOMER.customer_value_tier}; ${formatCurrency(MOCK_CUSTOMER.revenue_at_risk)} revenue at risk.`}
                meterValue={78}
                gradient={BLUE_GRADIENT}
              />
              <SignalRow
                icon={CreditCard}
                label="Credit demand"
                value={MOCK_CUSTOMER.predicted_credit_usage_90d.toLocaleString()}
                hint={`${MOCK_CUSTOMER.predicted_credit_usage_30d.toLocaleString()} credits expected in 30 days.`}
                meterValue={100}
                gradient={BRAND_GRADIENT}
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
      <div className="border-b border-[color:var(--line-2)] px-5 py-4">
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
    <div className="flex items-center justify-between gap-4 rounded-[22px] border border-[color:var(--line)] bg-white/80 px-4 py-3.5 shadow-[var(--shadow-1)]">
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
          {label}
        </p>
        <p className="mt-1 truncate text-[11.5px] text-[color:var(--ink-4)]">{hint}</p>
      </div>
      <p className="num shrink-0 whitespace-nowrap text-right text-[22px] font-semibold tracking-[-0.03em] text-[color:var(--ink-1)]">
        {value}
      </p>
    </div>
  );
}

function UsageLineChart({
  data,
  compact = false,
}: {
  data: readonly { month: string; usage: number }[];
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
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${path} L ${points[points.length - 1]?.x ?? paddingX} ${height - paddingY} L ${paddingX} ${height - paddingY} Z`;

  return (
    <div className="overflow-hidden rounded-[24px] border border-[color:var(--line)] bg-white p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`${compact ? "h-[220px]" : "h-[280px]"} w-full`}
        role="img"
        aria-label="Customer usage trend line chart"
      >
        <defs>
          <linearGradient id="usageLineGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={MOBY_BRAND.blue} />
            <stop offset="58%" stopColor={MOBY_BRAND.blueLight} />
            <stop offset="100%" stopColor={MOBY_BRAND.orange} />
          </linearGradient>
          <linearGradient id="usageAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={MOBY_BRAND.blueLight} stopOpacity="0.22" />
            <stop offset="100%" stopColor={MOBY_BRAND.blueLight} stopOpacity="0" />
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
            <circle cx={point.x} cy={point.y} r="7" fill="white" stroke={MOBY_BRAND.blue} strokeWidth="3" />
            <text x={point.x} y={height - 6} textAnchor="middle" className="fill-[color:var(--ink-5)] text-[11px] font-semibold">
              {point.month}
            </text>
            <text x={point.x} y={point.y - 14} textAnchor="middle" className="fill-[color:var(--ink-3)] text-[11px] font-semibold">
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
  hint,
  meterValue,
  gradient,
}: {
  icon: ElementType;
  label: string;
  value: string;
  hint: string;
  meterValue: number;
  gradient: string;
}) {
  return (
    <div className="rounded-[24px] border border-[color:var(--line)] bg-white p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[color:var(--surface-2)] text-[color:var(--moby-700)]">
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-[color:var(--ink-1)]">{label}</p>
          <p className="num mt-1 text-[20px] font-semibold text-[color:var(--ink-1)]">{value}</p>
          <p className="mt-2 text-[11.5px] leading-5 text-[color:var(--ink-4)]">{hint}</p>
        </div>
      </div>
      <BrandMeter value={meterValue} max={100} gradient={gradient} hideValue />
    </div>
  );
}

function MiniStatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
        {label}
      </p>
      <p className="num mt-1 text-[20px] font-semibold text-[color:var(--ink-1)]">
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
