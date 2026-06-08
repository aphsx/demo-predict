"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ElementType, ReactNode } from "react";
import {
  ArrowLeft,
  Mail,
  MessageSquareText,
  Phone,
  Send,
  ShieldCheck,
  Target,
} from "lucide-react";
import { ProgressMeter, SectionCard, StatusPill, lifecycleTone, urgencyTone } from "@/components/ui";

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

  return (
    <div className="pb-12">
      <div className="px-8 pt-6 pb-2 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="mb-1">
            <Link href="/customers" className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[.16em] text-[color:var(--moby-700)] hover:underline">
              <ArrowLeft size={11} /> Customers
            </Link>
          </div>
          <h2 className="text-[20px] font-semibold text-[color:var(--ink-1)] leading-tight">
            Account {accId}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone="neutral" dot={false}>Mockup</StatusPill>
          <ActionBtn icon={Phone}>Log call</ActionBtn>
          <ActionBtn icon={Mail}>Send email</ActionBtn>
          <ActionBtn icon={Send} primary>Trigger campaign</ActionBtn>
        </div>
      </div>

      <div className="px-8 mt-4 space-y-5">
        <section className="surface p-5">
          <div className="flex items-center gap-5 flex-wrap">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)] text-white grid place-items-center font-semibold text-[18px]">
              {accId.slice(-2)}
            </div>
            <div className="flex-1 min-w-[260px]">
              <div className="flex items-center flex-wrap gap-2">
                <StatusPill tone={lifecycleTone(MOCK_CUSTOMER.lifecycle_stage)}>
                  {MOCK_CUSTOMER.lifecycle_stage}
                </StatusPill>
                <StatusPill tone="neutral" dot={false}>{MOCK_CUSTOMER.sub_stage}</StatusPill>
                <StatusPill tone="danger">{MOCK_CUSTOMER.churn_risk_level} churn risk</StatusPill>
              </div>
              <div className="mt-2 flex items-center gap-4 text-[12px] text-[color:var(--ink-4)] flex-wrap">
                <Meta label="Purchases" value={MOCK_CUSTOMER.n_purchases.toLocaleString()} />
                <Meta label="Total revenue" value={`${MOCK_CUSTOMER.total_revenue.toLocaleString()} ฿`} />
                <Meta label="Inactive" value={`${MOCK_CUSTOMER.days_since_last_activity} days`} />
                <Meta label="Ever paid" value={MOCK_CUSTOMER.ever_paid ? "Yes" : "No"} />
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <SectionCard title="Churn analysis" hint="ความน่าจะเป็นที่จะเลิกใช้ใน 6 เดือน">
            <ChurnGauge value={MOCK_CUSTOMER.churn_probability} />
            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[color:var(--line)] pt-4">
              <KV label="Risk level" value={MOCK_CUSTOMER.churn_risk_level} accent="rose" />
              <KV label="Usage trend" value={MOCK_CUSTOMER.usage_trend} />
              <KV label="Revenue at risk" value={`${MOCK_CUSTOMER.revenue_at_risk.toLocaleString()} ฿`} accent="rose" />
              <KV label="Output status" value={MOCK_CUSTOMER.output_status} />
            </div>
          </SectionCard>

          <SectionCard title="Lifetime value" hint="คาดการณ์ 6 เดือนข้างหน้า">
            <div className="space-y-4">
              <div>
                <div className="text-[11px] uppercase tracking-[.12em] text-[color:var(--ink-5)]">Predicted CLV</div>
                <div className="num text-[30px] font-semibold text-[color:var(--ink-1)] mt-1">
                  {MOCK_CUSTOMER.predicted_clv_6m.toLocaleString()} <span className="text-[14px] text-[color:var(--ink-4)]">฿</span>
                </div>
                <div className="mt-2">
                  <StatusPill tone="brand" dot={false}>{MOCK_CUSTOMER.customer_value_tier}</StatusPill>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 border-t border-[color:var(--line)] pt-4">
                <KV label="Avg txn value" value={`${MOCK_CUSTOMER.avg_transaction_value.toLocaleString()} ฿`} />
                <KV label="Purchases" value={MOCK_CUSTOMER.n_purchases} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Credit forecast" hint="คาดการณ์การใช้เครดิตและรอบเติมเครดิต">
            <div className="space-y-4">
              <ForecastBar label="30d usage" value={MOCK_CUSTOMER.predicted_credit_usage_30d} max={MOCK_CUSTOMER.predicted_credit_usage_90d} />
              <ForecastBar label="90d usage" value={MOCK_CUSTOMER.predicted_credit_usage_90d} max={MOCK_CUSTOMER.predicted_credit_usage_90d} />
              <div className="grid grid-cols-2 gap-4 border-t border-[color:var(--line)] pt-4">
                <KV label="Days until top-up" value={`${MOCK_CUSTOMER.estimated_days_until_topup} days`} accent="blue" />
                <div>
                  <div className="text-[11px] uppercase tracking-[.10em] text-[color:var(--ink-5)]">Urgency</div>
                  <div className="mt-1">
                    <StatusPill tone={urgencyTone(MOCK_CUSTOMER.credit_urgency_level)}>
                      {MOCK_CUSTOMER.credit_urgency_level}
                    </StatusPill>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-5">
          <SectionCard title="Recommended next step" hint="สรุปจาก priority_score และ recommended_action">
            <div className="space-y-4">
              <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[.12em] text-[color:var(--ink-5)]">Priority score</div>
                    <div className="num mt-1 text-[32px] font-semibold text-[color:var(--moby-700)]">{MOCK_CUSTOMER.priority_score}</div>
                  </div>
                  <Target size={24} className="text-[color:var(--moby-600)]" />
                </div>
                <div className="mt-3">
                  <ProgressMeter value={MOCK_CUSTOMER.priority_score} max={100} tone="blue" showValue={false} />
                </div>
              </div>
              <KV label="Recommended action" value={MOCK_CUSTOMER.recommended_action} accent="blue" />
              <KV label="Follow-up date" value={MOCK_CUSTOMER.recommended_followup_date} />
              <KV label="Reason" value={MOCK_CUSTOMER.priority_reason} />
            </div>
          </SectionCard>

          <SectionCard title="AI explanation" hint="ข้อความจาก AI ที่ persist ลง prediction output">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <StatusPill tone="ok">{MOCK_CUSTOMER.ai_status}</StatusPill>
                <StatusPill tone="neutral" dot={false}>{MOCK_CUSTOMER.ai_model}</StatusPill>
              </div>
              <div className="rounded-2xl border border-[color:var(--line)] bg-white p-4 text-[13px] leading-6 text-[color:var(--ink-3)]">
                {MOCK_CUSTOMER.ai_explanation}
              </div>
              <div className="rounded-2xl border border-[color:var(--moby-100)] bg-[color:var(--moby-50)] p-4">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[color:var(--moby-700)]">
                  <MessageSquareText size={14} /> Suggested message
                </div>
                <p className="text-[12.5px] leading-6 text-[color:var(--ink-3)]">
                  {MOCK_CUSTOMER.ai_recommended_message}
                </p>
              </div>
            </div>
          </SectionCard>
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
      </div>
    </div>
  );
}

function ActionBtn({ icon: Icon, children, primary }: { icon: ElementType; children: ReactNode; primary?: boolean }) {
  return (
    <button
      disabled
      title="Mockup only"
      className={`h-9 px-3 rounded-lg text-[13px] inline-flex items-center gap-1.5 cursor-not-allowed opacity-75 ${
        primary
          ? "bg-[color:var(--moby-600)] text-white"
          : "border border-[color:var(--line)] bg-white text-[color:var(--ink-2)]"
      }`}
    >
      <Icon size={14} /> {children}
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-[color:var(--ink-5)]">{label}</span>{" "}
      <b className="num text-[color:var(--ink-2)]">{value}</b>
    </span>
  );
}

function KV({ label, value, accent }: { label: string; value: ReactNode; accent?: "rose" | "ok" | "blue" }) {
  const color = accent === "rose" ? "var(--danger)" : accent === "ok" ? "var(--ok)" : accent === "blue" ? "var(--moby-700)" : "var(--ink-1)";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[.10em] text-[color:var(--ink-5)]">{label}</div>
      <div className="num text-[15px] font-semibold mt-1 leading-6" style={{ color }}>{value}</div>
    </div>
  );
}

function ChurnGauge({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const color = pct >= 0.6 ? "var(--danger)" : pct >= 0.35 ? "var(--warn)" : "var(--ok)";
  return (
    <div className="text-center">
      <div
        className="mx-auto grid h-[132px] w-[132px] place-items-center rounded-full"
        style={{
          background: `conic-gradient(${color} ${pct * 360}deg, var(--surface-2) 0deg)`,
        }}
      >
        <div className="grid h-[102px] w-[102px] place-items-center rounded-full bg-white">
          <div>
            <div className="num text-[28px] font-semibold leading-none" style={{ color }}>
              {(pct * 100).toFixed(1)}%
            </div>
            <div className="mt-1 text-[10.5px] text-[color:var(--ink-5)]">churn</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ForecastBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12px]">
        <span className="text-[color:var(--ink-4)]">{label}</span>
        <span className="num font-medium text-[color:var(--ink-2)]">{value.toLocaleString()}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[color:var(--surface-2)]">
        <div className="h-full rounded-full bg-[color:var(--moby-600)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
