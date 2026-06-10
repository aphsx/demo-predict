"use client";

import {
  CalendarClock,
  CreditCard,
  Gem,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";
import { formatCredits, formatCurrency, formatNumber } from "@/lib/format";
import { MOBY_BRAND } from "@/lib/login-brand-colors";
import type { DashboardOverview } from "@/mocks/dashboard";
import type { MonthlyRevenuePoint } from "@/mocks/monthly-revenue";
import { CreditUrgencyCard } from "./CreditUrgencyCard";
import { LifecycleMixCard } from "./LifecycleMixCard";
import { MetricCard } from "./MetricCard";
import { MonthlyRevenueCard } from "./MonthlyRevenueCard";
import { RiskCard } from "./RiskCard";
import { ValueCard } from "./ValueCard";
import { TEXT_SAFE } from "./palette";

export function DashboardView({
  overview,
  monthlyRevenue,
}: {
  overview: DashboardOverview;
  monthlyRevenue: MonthlyRevenuePoint[];
}) {
  const activeHighRiskPct = (overview.active_churn.high / overview.active_churn.base_customers) * 100;
  const ghostPct = (overview.totals.ghost_customers / overview.totals.customers) * 100;

  return (
    <main className="min-w-0 px-4 py-6 pb-12 sm:px-6 lg:px-8">
      

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Gem}
          label="Avg monthly value"
          value={formatCurrency(overview.monthly_value.avg_monthly_revenue)}
          hint={`${overview.monthly_value.months}-month avg from payment history`}
          tone="warn"
          href="/monthly-value"
        />
        <MetricCard
          icon={TrendingDown}
          label="Active high risk"
          value={formatNumber(overview.active_churn.high)}
          hint={`${activeHighRiskPct.toFixed(1)}% จากลูกค้าทั้งหมดที่ใช้งาน`}
          tone="danger"
        />
        <MetricCard
          icon={CreditCard}
          label="Revenue at risk"
          value={formatCurrency(overview.totals.revenue_at_risk)}
          hint="การสูญเสียที่คาดการณ์ไว้หากลูกค้าที่มีความเสี่ยงสูงละลาย"
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
      </section>

      <section className="surface mt-6 p-4">
        <div className={`flex min-w-0 flex-wrap items-center gap-3 text-[11px] text-[color:var(--ink-5)] ${TEXT_SAFE}`}>
          <ShieldCheck size={12} />
          Mock dashboard data is isolated in `src/mocks/dashboard.ts`
          <span className="opacity-50">·</span>
          API-ready shape: totals / lifecycle / active_churn / value / credit / monthly_usage
          <span className="opacity-50">·</span>
          Ghost share: {ghostPct.toFixed(1)}%
        </div>
      </section>
    </main>
  );
}
