import type {
  RunStatus,
  LifecycleStage,
  RiskLevel,
  ValueTier,
  UrgencyLevel,
} from "./enums";

export interface ChurnFactor {
  feature: string;
  value: number | string;
  direction: "up" | "down";
  impact: number;
}

export interface ModelEligibility {
  eligible: boolean;
  status: "predicted" | "not_eligible" | "insufficient_data" | "failed";
  reason: string | null;
}

export interface ProfileSnapshot {
  join_date: string;
  customer_age_days: number;
  status_sms: string | null;
  status_email: string | null;
  credit_sms: number;
  credit_email: number;
  expire_sms: string | null;
  expire_email: string | null;
  last_access: string | null;
  last_send: string | null;
  sms_usage_share: number;
  email_usage_share: number;
  bc_usage_share: number;
  api_usage_share: number;
  otp_usage_share: number;
  usage_total_180d: number;
}

export interface PredictionRun {
  id: string;
  name: string;
  status: RunStatus;
  predict_source_id: string;
  predict_source_name: string;
  cutoff_date: string;
  total_customers: number | null;
  created_by: string | null;
  created_at: string;
  finished_at: string | null;
  error_message: string | null;
  progress: { step: string; pct: number } | null;
}

export interface PredictionOutput {
  prediction_run_id: string;
  acc_id: number;
  lifecycle_stage: LifecycleStage;
  sub_stage: string;
  days_since_last_activity: number | null;
  n_purchases: number;
  total_revenue: number;
  avg_transaction_value: number | null;
  ever_paid: boolean;
  usage_trend: "increasing" | "stable" | "declining" | "no_usage";
  profile_snapshot: ProfileSnapshot;
  churn_probability: number | null;
  churn_risk_level: RiskLevel | null;
  churn_factors: ChurnFactor[] | null;
  predicted_clv_6m: number | null;
  p_alive: number | null;
  customer_value_tier: ValueTier;
  predicted_credit_usage_30d: number | null;
  predicted_credit_usage_90d: number | null;
  credit_forecast_interval: { p10_30d: number; p90_30d: number; p10_90d: number; p90_90d: number } | null;
  estimated_days_until_topup: number | null;
  credit_urgency_level: UrgencyLevel | null;
  revenue_at_risk: number | null;
  priority_score: number;
  segment: string | null;
  action_rank: number | null;
  needs_review: boolean;
  ai_status: "not_requested" | "pending" | "completed" | "failed";
  ai_explanation: string | null;
  output_status: "predicted" | "partial" | "insufficient_data";
  model_eligibility: { churn: ModelEligibility; clv: ModelEligibility; credit: ModelEligibility };
  model_versions: { churn: string; clv: string; credit: string };
}

export interface RunSummary {
  run: {
    id: string;
    name: string;
    cutoff_date: string;
    status: RunStatus;
    total_customers: number;
    finished_at: string | null;
  };
  lifecycle: { active_paid: number; active_free: number; churned: number; ghost: number };
  churn: {
    eligible_count: number;
    by_risk: Record<RiskLevel, number>;
    thresholds: { medium: number; high: number; critical: number };
  };
  revenue: {
    expected_at_risk: number;
    high_risk_exposure: number;
    monthly_actual: { month: string; amount: number; n_payments: number }[];
  };
  value_risk_matrix: { value_tier: ValueTier; risk_level: RiskLevel; count: number; clv_sum: number }[];
  credit: {
    demand_30d: number;
    by_urgency: Record<UrgencyLevel, number>;
    topup_due_7d: number;
  };
  top_priority: {
    acc_id: number;
    lifecycle_stage: LifecycleStage;
    churn_probability: number | null;
    predicted_clv_6m: number | null;
    priority_score: number;
  }[];
  model_versions: { churn: string; clv: string; credit: string };
}

export interface OutputsQuery {
  page?: number;
  page_size?: number;
  sort?: string;
  search?: string;
  lifecycle_stage?: LifecycleStage | "";
  churn_risk_level?: RiskLevel | "";
  customer_value_tier?: ValueTier | "";
  credit_urgency_level?: UrgencyLevel | "";
  ever_paid?: "true" | "false" | "";
}

export interface OutputsPage {
  total: number;
  page: number;
  page_size: number;
  data: PredictionOutput[];
}

export interface MonthlyUsagePoint {
  month: string;
  sms: number;
  email: number;
  bc: number;
  api: number;
  otp: number;
  total: number;
}

export interface PaymentEvent {
  payment_date: string;
  amount: number;
  credit_add: number;
  credit_type: string;
}

export interface CustomerAiExplanationResult {
  acc_id: number;
  ai_status: PredictionOutput["ai_status"];
  ai_explanation: string | null;
  ai_model: string;
  ai_generated_at: string;
}
