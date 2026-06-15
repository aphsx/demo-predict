"use client";

import {
  CalendarClock,
  CreditCard,
  Gem,
  ShieldCheck,
  TrendingDown,
  Users,
} from "lucide-react";
import { formatCredits, formatCurrency, formatNumber } from "@/lib/format";
import type { RunSummary } from "@/lib/ml-api";
import { CreditUrgencyCard } from "./credit-urgency-card";
import { LifecycleMixCard } from "./lifecycle-mix-card";
import { MetricCard } from "./metric-card";
import { MonthlyRevenueCard } from "./monthly-revenue-card";
import { RiskCard } from "./risk-card";
import { TopPriorityCard } from "./top-priority-card";
import { ValueCard } from "./value-card";
import { ValueRiskMatrixCard } from "./value-risk-matrix-card";
import { TEXT_SAFE } from "./palette";
import { fromRunSummary } from "./types";

export function DashboardView({ summary, runId }: { summary: RunSummary; runId: string }) {
  const { overview, monthlyRevenue } = fromRunSummary(summary);
  const activeHighRiskPct =
    overview.active_churn.base_customers > 0
      ? (overview.active_churn.high / overview.active_churn.base_customers) * 100
      : 0;

  return (
    <main className="min-w-0 px-4 py-6 pb-12 sm:px-6 lg:px-8">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={Users}
          label="Total customers"
          value={formatNumber(overview.totals.customers)}
          hint={`run cutoff ${overview.run.cutoff_date}`}
          tone="brand"
        />
        <MetricCard
          icon={Gem}
          label="Avg monthly value"
          value={formatCurrency(overview.monthly_value.avg_monthly_revenue)}
          hint={`${overview.monthly_value.months}-month avg from payment history (actual)`}
          tone="warn"
        />
        <MetricCard
          icon={TrendingDown}
          label="Active high risk"
          value={formatNumber(overview.active_churn.high)}
          hint={`${activeHighRiskPct.toFixed(1)}% of churn-eligible (active paid) — forecast`}
          tone="danger"
        />
        <MetricCard
          icon={CreditCard}
          label="Revenue at risk"
          value={formatCurrency(overview.totals.revenue_at_risk)}
          hint="expected 6m loss across active paid — forecast"
          tone="warn"
        />
        <MetricCard
          icon={CalendarClock}
          label="30d credit demand"
          value={formatCredits(overview.credit.predicted_usage_30d)}
          hint="การคาดการณ์ความต้องการในการใช้งาน SMS/Email"
          tone="brand"
        />
      </section>

      <section className="mt-6 space-y-6">
        <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
          <LifecycleMixCard overview={overview} />
          <MonthlyRevenueCard data={monthlyRevenue} />
        </div>
        <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-3">
          <RiskCard overview={overview} />
          <ValueCard overview={overview} />
          <CreditUrgencyCard overview={overview} />
        </div>
        <ValueRiskMatrixCard summary={summary} runId={runId} />
        <TopPriorityCard summary={summary} runId={runId} />
      </section>

      <section className="surface mt-6 p-4">
        <div className={`flex min-w-0 flex-wrap items-center gap-3 text-[11px] text-[color:var(--ink-5)] ${TEXT_SAFE}`}>
          <ShieldCheck size={12} />
          Run: {overview.run.name} · cutoff {overview.run.cutoff_date}
          <span className="opacity-50">·</span>
          Models: churn {summary.model_versions.churn} / clv {summary.model_versions.clv} / credit{" "}
          {summary.model_versions.credit}
        </div>
      </section>
    </main>
  );
}
