/**
 * Dashboard overview mock. API-ready shape:
 * totals / lifecycle / active_churn / value / credit / monthly_value.
 */

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

const MOCK_OVERVIEW: DashboardOverview = {
  run: {
    name: "June 2026 prediction run",
    cutoff_date: "2026-06-01",
    output_status: "mock",
  },
  totals: {
    customers: 1284,
    active_customers: 846,
    paid_customers: 512,
    ghost_customers: 187,
    revenue_at_risk: 1286000,
    followups_due_7d: 74,
  },
  lifecycle: {
    "Active Paid": 512,
    "Active Free": 334,
    Churned: 251,
    Ghost: 187,
  },
  active_churn: {
    base_customers: 846,
    high: 96,
    medium: 214,
    low: 536,
  },
  value: {
    high_value: 118,
    mid_value: 392,
    low_value: 337,
    high_value_at_risk: 41,
    predicted_clv_6m: 5420000,
  },
  monthly_value: {
    avg_monthly_revenue: 914000,
    last_month_revenue: 1048000,
    months: 12,
  },
  credit: {
    critical: 28,
    warning: 66,
    monitor: 143,
    stable: 609,
    next_topup_7d: 52,
    predicted_usage_30d: 1840000,
  },
};

export async function getDashboardOverview(): Promise<DashboardOverview> {
  return MOCK_OVERVIEW;
}
