/**
 * Dashboard view-model types + adapter from the ML v2 RunSummary contract
 * (docs/ML-V2-DASHBOARD-SPEC.md §4). The card components render this shape;
 * the adapter is the only place that maps contract → view-model.
 */
import type { RunSummary } from "@/lib/ml-api";

export type MonthlyRevenuePoint = {
  month: string; // YYYY-MM
  revenue: number;
  payments: number;
};

export type DashboardOverview = {
  run: {
    name: string;
    cutoff_date: string;
    output_status: "mock" | "ready" | "processing";
  };
  totals: {
    customers: number;
    active_customers: number;
    paid_customers: number;
    ghost_customers: number;
    revenue_at_risk: number;
    followups_due_7d: number;
  };
  lifecycle: Record<"Active Paid" | "Active Free" | "Churned" | "Ghost", number>;
  active_churn: {
    base_customers: number;
    high: number;
    medium: number;
    low: number;
  };
  value: {
    high_value: number;
    mid_value: number;
    low_value: number;
    high_value_at_risk: number;
    predicted_clv_6m: number;
  };
  monthly_value: {
    avg_monthly_revenue: number;
    last_month_revenue: number;
    months: number;
  };
  credit: {
    critical: number;
    warning: number;
    monitor: number;
    stable: number;
    next_topup_7d: number;
    predicted_usage_30d: number;
  };
};

const tierCount = (s: RunSummary, tier: string) =>
  s.value_risk_matrix.filter((c) => c.value_tier === tier).reduce((a, c) => a + c.count, 0);

export function fromRunSummary(s: RunSummary): {
  overview: DashboardOverview;
  monthlyRevenue: MonthlyRevenuePoint[];
} {
  const monthlyRevenue = s.revenue.monthly_actual.map((m) => ({
    month: m.month,
    revenue: m.amount,
    payments: m.n_payments,
  }));
  const avg =
    monthlyRevenue.reduce((a, m) => a + m.revenue, 0) / Math.max(monthlyRevenue.length, 1);

  const highValueAtRisk = s.value_risk_matrix
    .filter((c) => c.value_tier === "high" && (c.risk_level === "high" || c.risk_level === "critical"))
    .reduce((a, c) => a + c.count, 0);

  const overview: DashboardOverview = {
    run: {
      name: s.run.name,
      cutoff_date: s.run.cutoff_date,
      output_status: "ready",
    },
    totals: {
      customers: s.run.total_customers,
      active_customers: s.lifecycle.active_paid + s.lifecycle.active_free,
      paid_customers: s.lifecycle.active_paid,
      ghost_customers: s.lifecycle.ghost,
      revenue_at_risk: s.revenue.expected_at_risk,
      followups_due_7d: s.credit.topup_due_7d,
    },
    lifecycle: {
      "Active Paid": s.lifecycle.active_paid,
      "Active Free": s.lifecycle.active_free,
      Churned: s.lifecycle.churned,
      Ghost: s.lifecycle.ghost,
    },
    active_churn: {
      // base = churn-eligible customers (Active Paid) — the model only scores these
      base_customers: s.churn.eligible_count,
      high: s.churn.by_risk.high + s.churn.by_risk.critical,
      medium: s.churn.by_risk.medium,
      low: s.churn.by_risk.low,
    },
    value: {
      high_value: tierCount(s, "high"),
      mid_value: tierCount(s, "mid"),
      low_value: tierCount(s, "low"),
      high_value_at_risk: highValueAtRisk,
      predicted_clv_6m: s.value_risk_matrix.reduce((a, c) => a + c.clv_sum, 0),
    },
    monthly_value: {
      avg_monthly_revenue: Math.round(avg),
      last_month_revenue: monthlyRevenue[monthlyRevenue.length - 1]?.revenue ?? 0,
      months: monthlyRevenue.length,
    },
    credit: {
      critical: s.credit.by_urgency.critical,
      warning: s.credit.by_urgency.warning,
      monitor: s.credit.by_urgency.monitor,
      stable: s.credit.by_urgency.stable,
      next_topup_7d: s.credit.topup_due_7d,
      predicted_usage_30d: s.credit.demand_30d,
    },
  };

  return { overview, monthlyRevenue };
}
