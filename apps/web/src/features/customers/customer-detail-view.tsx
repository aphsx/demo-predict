"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { ChurnFactor } from "@/lib/ml-api";
import {
  BrandMeter,
  BLUE_GRADIENT,
  CHURN_COLOR,
  CHURN_GRADIENT,
  CreditCard,
  FactCard,
  Gem,
  HeroMetric,
  HighValueMedal,
  isHighValueTier,
  LifecycleDetailPill,
  MiniStatCard,
  Panel,
  ReasoningStack,
  SignalRow,
  SolidDetailPill,
  TrendingDown,
} from "./customer-detail-primitives";
import { UsageLineChart } from "./customer-usage-chart";
import type { UsageTrendPoint } from "./customer-usage-chart";

export type { UsageTrendPoint };

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
  churn_factors: ChurnFactor[] | null;
  ai_status: "not_requested" | "pending" | "completed" | "failed";
  ai_explanation: string | null;
  output_status: string;
};

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
                  <SolidDetailPill color="#9ca3af">{customer.sub_stage}</SolidDetailPill>
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
                  value={customer.days_since_last_activity != null ? `${customer.days_since_last_activity}d` : "—"}
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
              <ReasoningStack customer={customer} />
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
                value={customer.predicted_credit_usage_90d != null ? customer.predicted_credit_usage_90d.toLocaleString() : "—"}
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
