"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ElementType, ReactNode } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CreditCard,
  Gem,
  Mail,
  MessageSquareText,
  Phone,
  Send,
  ShieldCheck,
  Target,
  TrendingDown,
} from "lucide-react";
import { StatusPill, lifecycleTone, urgencyTone } from "@/components/ui";
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
      <section
        className="relative overflow-hidden rounded-[30px] border border-white/20 px-6 py-6 text-white shadow-[var(--shadow-2)] sm:px-7 lg:px-8"
        style={{
          backgroundImage: [
            "radial-gradient(rgba(7, 29, 126, 0.48) 0%, transparent 44%)",
            "url(/assets/intro/about_bg.webp)",
            "linear-gradient(180deg, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.04) 42%, rgba(0,0,0,0.14) 100%)",
            `linear-gradient(140deg, ${MOBY_BRAND.dark} -10%, ${MOBY_BRAND.blue} 56%, ${MOBY_BRAND.blueLight} 72%, ${MOBY_BRAND.orangeWarm} 88%, ${MOBY_BRAND.orange} 100%)`,
          ].join(", "),
          backgroundRepeat: "no-repeat, no-repeat, no-repeat, no-repeat",
          backgroundSize: "140% 150%, cover, 100% 100%, 100% 100%",
          backgroundPosition: "center, center, center, center",
        }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.12),transparent_45%)]" />
        <div className="relative">
          <Link
            href="/customers"
            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[.16em] text-white/72 hover:text-white"
          >
            <ArrowLeft size={11} /> Customers
          </Link>

          <div className="mt-5 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusPill tone={lifecycleTone(MOCK_CUSTOMER.lifecycle_stage)}>
                  {MOCK_CUSTOMER.lifecycle_stage}
                </StatusPill>
                <StatusPill tone="neutral" dot={false}>{MOCK_CUSTOMER.sub_stage}</StatusPill>
                <StatusPill tone="danger">{MOCK_CUSTOMER.churn_risk_level} churn risk</StatusPill>
                <StatusPill tone="neutral" dot={false}>Mockup</StatusPill>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/68">
                Customer 360
              </p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-[42px]">
                Account {accId}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/78 sm:text-[15px]">
                สรุปภาพรวมลูกค้ารายนี้แบบอ่านเร็ว: ความเสี่ยง churn, มูลค่าที่ควรปกป้อง,
                การใช้เครดิต และ action ที่ทีม 1Moby ควรทำต่อ
              </p>
            </div>

            <div className="w-full rounded-[24px] border border-white/16 bg-white/12 p-4 backdrop-blur xl:w-[360px]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-white/60">
                    Priority score
                  </div>
                  <div className="num mt-1 text-[40px] font-semibold leading-none">
                    {MOCK_CUSTOMER.priority_score}
                  </div>
                </div>
                <Target size={30} className="text-white/86" />
              </div>
              <div className="mt-4">
                <BrandMeter
                  value={MOCK_CUSTOMER.priority_score}
                  max={100}
                  gradient={ORANGE_GRADIENT}
                  trackClassName="bg-white/18"
                  hideValue
                />
              </div>
              <p className="mt-3 text-[12px] leading-5 text-white/72">
                {MOCK_CUSTOMER.recommended_action}
              </p>
            </div>
          </div>
        </div>
      </section>

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
          icon={CalendarClock}
          label="Follow-up"
          value={MOCK_CUSTOMER.recommended_followup_date}
          hint="recommended next contact"
          color={MOBY_BRAND.blueLight}
        />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
        <Panel eyebrow="Prediction signals" title="Risk, value, and credit">
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

        <Panel eyebrow="Next best action" title="What the team should do">
          <div className="space-y-4">
            <div className="rounded-[24px] border p-4" style={{ borderColor: "rgba(252,76,2,0.22)", background: "rgba(252,76,2,0.055)" }}>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white shadow-[0_12px_28px_rgba(252,76,2,0.16)]" style={{ background: ORANGE_GRADIENT }}>
                  <Phone size={18} />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-[color:var(--ink-1)]">
                    {MOCK_CUSTOMER.recommended_action}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-6 text-[color:var(--ink-4)]">
                    {MOCK_CUSTOMER.priority_reason}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <InfoTile label="Follow-up date" value={MOCK_CUSTOMER.recommended_followup_date} />
              <InfoTile label="Urgency" value={<StatusPill tone={urgencyTone(MOCK_CUSTOMER.credit_urgency_level)}>{MOCK_CUSTOMER.credit_urgency_level}</StatusPill>} />
              <InfoTile label="Lifecycle" value={MOCK_CUSTOMER.lifecycle_stage} />
              <InfoTile label="Ever paid" value={MOCK_CUSTOMER.ever_paid ? "Yes" : "No"} />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <ActionBtn icon={Phone}>Log call</ActionBtn>
              <ActionBtn icon={Mail}>Send email</ActionBtn>
              <ActionBtn icon={Send} primary>Trigger campaign</ActionBtn>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <Panel eyebrow="Credit forecast" title="Top-up timing">
          <div className="space-y-4">
            <BrandMeter
              label="30d usage"
              value={MOCK_CUSTOMER.predicted_credit_usage_30d}
              max={MOCK_CUSTOMER.predicted_credit_usage_90d}
              gradient={BLUE_GRADIENT}
              formatValue={(value) => value.toLocaleString()}
            />
            <BrandMeter
              label="90d usage"
              value={MOCK_CUSTOMER.predicted_credit_usage_90d}
              max={MOCK_CUSTOMER.predicted_credit_usage_90d}
              gradient={BRAND_GRADIENT}
              formatValue={(value) => value.toLocaleString()}
            />
            <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3 text-[12.5px] leading-6 text-[color:var(--ink-4)]">
              เหลือประมาณ <b className="num text-[color:var(--ink-1)]">{MOCK_CUSTOMER.estimated_days_until_topup} วัน</b> ก่อนถึงรอบเติมเครดิตถัดไป ควรติดต่อก่อน usage ลดลงต่อเนื่อง
            </div>
          </div>
        </Panel>

        <Panel eyebrow="AI assist" title="Explanation and suggested message">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-[24px] border border-[color:var(--line)] bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusPill tone="ok">{MOCK_CUSTOMER.ai_status}</StatusPill>
                <StatusPill tone="neutral" dot={false}>{MOCK_CUSTOMER.ai_model}</StatusPill>
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
      </section>

      <section className="surface p-4">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[color:var(--ink-5)]">
          <ShieldCheck size={12} /> Mockup from ML v2 prediction output fields
          <span className="opacity-50">·</span>
          lifecycle / churn / clv / credit / action / ai
          <span className="opacity-50">·</span>
          API not connected
        </div>
      </section>
    </main>
  );
}

function ActionBtn({ icon: Icon, children, primary }: { icon: ElementType; children: ReactNode; primary?: boolean }) {
  return (
    <button
      disabled
      title="Mockup only"
      className={`inline-flex h-10 flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-2xl px-3 text-[13px] font-semibold opacity-75 sm:flex-none ${
        primary
          ? "text-white shadow-[0_14px_30px_rgba(0,107,255,0.14)]"
          : "border border-[color:var(--line)] bg-white text-[color:var(--ink-2)]"
      }`}
      style={primary ? { background: BLUE_GRADIENT } : undefined}
    >
      <Icon size={14} /> {children}
    </button>
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

function InfoTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-white p-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">{label}</p>
      <div className="num mt-1 text-[13px] font-semibold text-[color:var(--ink-1)]">{value}</div>
    </div>
  );
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString()} ฿`;
}
