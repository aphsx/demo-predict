"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { MOBY_BRAND } from "@/lib/login-brand-colors";
import type { ChurnFactor, PaymentEvent, ProfileSnapshot } from "@/lib/ml-api";
import { CustomerPaymentChart } from "./customer-payment-chart";
import { CustomerProfilePanel } from "./customer-profile-panel";
import {
  CHURN_COLOR,
  FactCard,
  HeroMetric,
  HighValueMedal,
  isHighValueTier,
  LifecycleDetailPill,
  MiniStatCard,
  Panel,
  ReasoningStack,
  SolidDetailPill,
} from "./customer-detail-primitives";
import { UsageCreditPanel, type UsageTrendPoint } from "./customer-usage-chart";

export type { UsageTrendPoint };

export type CustomerDetail = {
  lifecycle_stage: string;
  sub_stage: string;
  churn_probability: number | null;
  churn_risk_level: string | null;
  predicted_clv_6m: number | null;
  p_alive: number | null;
  customer_value_tier: string;
  revenue_at_risk: number | null;
  predicted_credit_usage_30d: number | null;
  predicted_credit_usage_90d: number | null;
  credit_forecast_interval: { p10_30d: number; p90_30d: number; p10_90d: number; p90_90d: number } | null;
  estimated_days_until_topup: number | null;
  credit_urgency_level: string | null;
  usage_trend: "increasing" | "stable" | "declining" | "no_usage";
  days_since_last_activity: number | null;
  n_purchases: number;
  total_revenue: number;
  avg_transaction_value: number | null;
  ever_paid: boolean;
  segment: string | null;
  action_rank: number | null;
  needs_review: boolean;
  profile_snapshot: ProfileSnapshot;
  churn_factors: ChurnFactor[] | null;
  ai_status: "not_requested" | "pending" | "completed" | "failed";
  ai_explanation: string | null;
  output_status: string;
};

const USAGE_TREND_BADGE: Record<CustomerDetail["usage_trend"], { label: string; color: string } | null> = {
  increasing: { label: "ใช้งานเพิ่มขึ้น", color: "#10b981" },
  declining: { label: "ใช้งานลดลง", color: CHURN_COLOR },
  stable: { label: "ใช้งานคงที่", color: "#9ca3af" },
  no_usage: null,
};

export function CustomerDetailView({
  accId,
  customer,
  usageTrend,
  payments,
  runId,
  customersHref,
}: {
  accId: string;
  customer: CustomerDetail;
  usageTrend: UsageTrendPoint[];
  payments: PaymentEvent[];
  runId?: string;
  customersHref?: string;
}) {
  const churnPct = customer.churn_probability != null ? customer.churn_probability * 100 : null;
  const pAlivePct = customer.p_alive != null ? customer.p_alive * 100 : null;
  const latestUsage = usageTrend.at(-1);
  const peakUsage = usageTrend.length > 0 ? Math.max(...usageTrend.map((point) => point.total)) : null;
  const showSubStage =
    Boolean(customer.sub_stage) && customer.sub_stage !== customer.lifecycle_stage;
  const customerListHref = customersHref ?? (runId ? `/customers?run=${encodeURIComponent(runId)}` : "/customers");

  const trend = USAGE_TREND_BADGE[customer.usage_trend];
  const creditRange = (point: number | null, p10: number | null, p90: number | null): string => {
    if (point == null) return "—";
    const base = point.toLocaleString();
    if (p10 == null || p90 == null) return base;
    return `${base} (${p10.toLocaleString()}–${p90.toLocaleString()})`;
  };
  const interval = customer.credit_forecast_interval;

  return (
    <main className="px-8 py-6 pb-12">
      <Link
        href={customerListHref}
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[.16em] text-[color:var(--ink-5)] hover:text-[color:var(--moby-600)]"
      >
        <ArrowLeft size={11} /> Customers
      </Link>

      {customer.needs_review && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800">
          <AlertTriangle size={15} className="shrink-0" />
          ลูกค้ารายนี้ถูกตั้งค่าให้ตรวจสอบด้วยมือ (needs review) — ผลโมเดลอาจไม่น่าเชื่อถือเต็มที่
        </div>
      )}

      <section className="mt-4 space-y-5">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[390px_minmax(0,1fr)_340px] xl:items-stretch">
          <Panel title={`Account ${accId}`}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {isHighValueTier(customer.customer_value_tier) ? <HighValueMedal /> : null}
                <LifecycleDetailPill stage={customer.lifecycle_stage} />
                {customer.segment && (
                  <SolidDetailPill color={MOBY_BRAND.dark}>
                    {customer.segment}
                    {customer.action_rank != null ? ` · #${customer.action_rank}` : ""}
                  </SolidDetailPill>
                )}
                {showSubStage && (
                  <SolidDetailPill color="#9ca3af">{customer.sub_stage}</SolidDetailPill>
                )}
                {customer.churn_risk_level && (
                  <SolidDetailPill color={CHURN_COLOR} dot>
                    {customer.churn_risk_level} churn risk
                  </SolidDetailPill>
                )}
                {trend && (
                  <SolidDetailPill color={trend.color}>{trend.label}</SolidDetailPill>
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
                  label="P(alive)"
                  value={pAlivePct != null ? `${pAlivePct.toFixed(0)}%` : "—"}
                  hint="ยังใช้บริการอยู่ (BG/NBD)"
                  valueColor={MOBY_BRAND.blue}
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
                  value={customer.estimated_days_until_topup != null ? `${customer.estimated_days_until_topup}d` : "—"}
                  hint={customer.credit_urgency_level ?? "ข้อมูลไม่พอประเมิน"}
                />
              </div>
            </div>
          </Panel>

          <UsageCreditPanel data={usageTrend}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MiniStatCard
                label="Latest usage"
                value={latestUsage?.total.toLocaleString() ?? "—"}
                hint={latestUsage ? `${latestUsage.month} credits` : "ไม่มีข้อมูล usage"}
              />
              <MiniStatCard
                label="Peak usage"
                value={peakUsage != null ? peakUsage.toLocaleString() : "—"}
                hint="last 6 months"
              />
              <MiniStatCard
                label="Inactive"
                value={customer.days_since_last_activity != null ? `${customer.days_since_last_activity}d` : "—"}
                hint="since last activity"
              />
            </div>
          </UsageCreditPanel>

          <div className="flex min-h-0 flex-col xl:row-span-2">
            <Panel
              title="เหตุผล"
              className="flex min-h-0 flex-1 flex-col"
              bodyClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              <ReasoningStack customer={customer} />
            </Panel>
          </div>

          <Panel title="โปรไฟล์ลูกค้า" className="xl:col-span-2">
            <CustomerProfilePanel snapshot={customer.profile_snapshot} />
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[390px_minmax(0,1fr)] xl:items-start">
          <Panel title="Compact profile">
            <div className="grid grid-cols-2 gap-3">
              <FactCard label="Lifecycle" value={customer.lifecycle_stage} />
              <FactCard label="Purchases" value={customer.n_purchases.toLocaleString()} />
              <FactCard label="Total revenue" value={formatCurrency(customer.total_revenue)} />
              <FactCard
                label="Avg txn"
                value={customer.avg_transaction_value != null ? formatCurrency(customer.avg_transaction_value) : "—"}
              />
              <FactCard
                label="Credit 30d (p10–90)"
                value={creditRange(customer.predicted_credit_usage_30d, interval?.p10_30d ?? null, interval?.p90_30d ?? null)}
              />
              <FactCard
                label="Credit 90d (p10–90)"
                value={creditRange(customer.predicted_credit_usage_90d, interval?.p10_90d ?? null, interval?.p90_90d ?? null)}
              />
            </div>
          </Panel>

          <Panel title="ประวัติการชำระเงิน">
            <CustomerPaymentChart payments={payments} />
          </Panel>
        </div>
      </section>
    </main>
  );
}
