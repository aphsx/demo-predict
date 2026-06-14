/**
 * [NEW] ML v2 response contract — server-side mirror of
 * apps/web/src/lib/mlApi.ts (docs/ML-V2-DASHBOARD-SPEC.md §4/§7).
 * Keys are snake_case; keep both files in sync.
 */

export type RunStatus = "pending" | "in_progress" | "completed" | "failed";

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
  /** present while in_progress */
  progress: { step: string; pct: number } | null;
}

export type LifecycleStage = "Active Paid" | "Active Free" | "Churned" | "Ghost";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ValueTier = "high" | "mid" | "low" | "none";
export type UrgencyLevel = "critical" | "warning" | "monitor" | "stable";
/** Actionable value×risk playbook segment (priority ranking is by money). */
export type Segment = "retain_now" | "protect" | "rescue_or_let_go" | "monitor";

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
  priority_reason: string;
  segment: Segment;
  ai_status: "not_requested" | "pending" | "completed" | "failed";
  ai_explanation: string | null;
  ai_recommended_message: string | null;
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
    priority_reason: string;
    segment: Segment;
  }[];
  model_versions: { churn: string; clv: string; credit: string };
}

export interface OutputsPage {
  total: number;
  page: number;
  page_size: number;
  data: PredictionOutput[];
}

export interface MonthlyUsagePoint {
  month: string; // YYYY-MM
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

export interface SplitMetrics {
  split: "validation" | "test" | "backtest_avg";
  metrics: Record<string, number>;
}

export interface ModelPerfEntry {
  model_type: "lifecycle" | "churn" | "clv" | "credit";
  method: string;
  algorithm: string;
  version: string | null;
  trained_at: string | null;
  cutoff_date: string | null;
  dataset_rows: number | null;
  feature_set: string | null;
  primary_metric: { name: string; value: number | string; baseline?: number; baseline_name?: string };
  splits: SplitMetrics[];
  baselines: { name: string; metrics: Record<string, number> }[];
  thresholds?: Record<string, number>;
  calibration?: { prob_pred: number[]; prob_true: number[]; ece: number };
  confusion?: { tp: number; fp: number; fn: number; tn: number; threshold: number };
  lift_table?: { decile: number; share_of_churners: number; lift: number }[];
  notes?: string;
}

export interface TrainingRunResult {
  model_type: "churn" | "clv" | "credit";
  primary_metric_name: string;
  primary_metric_value: number;
  baseline_name: string;
  baseline_value: number;
  calibration_ece: number | null;
  leakage_passed: boolean;
  promoted: boolean;
  promote_reason: string;
  new_version: string | null;
}

export interface TrainingRun {
  id: string;
  status: RunStatus;
  dataset_name: string;
  cutoff_date: string;
  horizon_days: number;
  started_at: string;
  finished_at: string | null;
  created_by: string | null;
  error_message: string | null;
  progress: { phase: string; pct: number } | null;
  results: TrainingRunResult[] | null;
}

// ── Shared server helpers ───────────────────────────────────────

/** Drizzle `numeric` columns come back as strings — convert null-safely. */
export function num(v: string | number | null | undefined): number | null {
  return v === null || v === undefined ? null : Number(v);
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_RISK_THRESHOLDS = { medium: 0.3, high: 0.6, critical: 0.85 };

export const EMPTY_MODEL_VERSIONS = { churn: "", clv: "", credit: "" };

/** Last 12 calendar months strictly before the cutoff month, as YYYY-MM keys. */
export function monthKeysBeforeCutoff(cutoffDate: string): string[] {
  const cutoff = new Date(`${cutoffDate}T00:00:00Z`);
  const keys: string[] = [];
  for (let i = 12; i >= 1; i--) {
    const d = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}
