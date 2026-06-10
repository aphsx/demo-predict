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
    <main className="min-w-0 px-4 py-5 pb-12 sm:px-6 lg:px-8">
      <section
        className="relative min-w-0 overflow-hidden rounded-[26px] border border-white/20 px-4 py-6 text-white sm:rounded-[30px] sm:px-7 lg:px-8"
        style={{
          backgroundImage: [
            "radial-gradient(rgba(7, 29, 126, 0.52) 0%, transparent 42%)",
            "url(/assets/intro/about_bg.webp)",
            "linear-gradient(180deg, rgba(0,0,0,0.24) 0%, rgba(0,0,0,0.04) 38%, rgba(0,0,0,0.16) 100%)",
            `linear-gradient(140deg, ${MOBY_BRAND.blue} 0%, ${MOBY_BRAND.blue} 56%, ${MOBY_BRAND.blueLight} 82%, ${MOBY_BRAND.blue} 100%)`,
          ].join(", "),
          backgroundRepeat: "no-repeat, no-repeat, no-repeat, no-repeat",
          backgroundSize: "140% 150%, cover, 100% 100%, 100% 100%",
          backgroundPosition: "center, center, center, center",
        }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.10),transparent_45%)]" />
        <div className="relative">
          <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-5">
              <div className="min-w-0 max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/68">
                  ML v2 output summary
                </p>
                <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-[42px]">
                  Dashboard
                </h1>
                <p className={`mt-3 max-w-2xl text-sm leading-6 text-white/78 sm:text-[15px] ${TEXT_SAFE}`}>
                  ภาพรวมผล prediction ที่ควรเห็นก่อนเริ่มทำงาน: portfolio ทั้งหมด,
                  high-value risk, active churn risk, value at risk, credit urgency และรายได้รายเดือนล่าสุด
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
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
          hint={`${activeHighRiskPct.toFixed(1)}% of active customers`}
          tone="danger"
        />
        <MetricCard
          icon={CreditCard}
          label="Revenue at risk"
          value={formatCurrency(overview.totals.revenue_at_risk)}
          hint="estimated loss if high-risk customers churn"
          tone="warn"
        />
        <MetricCard
          icon={CalendarClock}
          label="30d credit demand"
          value={formatCredits(overview.credit.predicted_usage_30d)}
          hint="forecast from SMS/Email usage history"
          tone="brand"
        />
      </section>

      <section className="mt-5 space-y-5">
        <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
          <LifecycleMixCard overview={overview} />
          <MonthlyRevenueCard data={monthlyRevenue} />
        </div>
        <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-3">
          <RiskCard overview={overview} />
          <ValueCard overview={overview} />
          <CreditUrgencyCard overview={overview} />
        </div>
      </section>

      <section className="surface mt-5 p-4">
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
