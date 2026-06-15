/**
 * ML v2 API client — contract per docs/ML-V2-DASHBOARD-SPEC.md §4/§7 and
 * docs/ML-V2-OUTPUT-CONTRACT.md.
 *
 * The Elysia routes are mounted: /prediction-runs, /training-runs,
 * /model-performance, plus suggested-cutoff endpoints for train/predict data.
 * Set NEXT_PUBLIC_ML_USE_MOCK=1 for offline dev: every function then serves
 * from the deterministic mock in src/mocks/ml.ts (single source — summary
 * numbers are derived from the same customer rows the table pages show).
 * Views must surface IS_ML_MOCK as a "Demo data" badge.
 */

export const IS_ML_MOCK = process.env.NEXT_PUBLIC_ML_USE_MOCK === "1";

// ── Contract types ──────────────────────────────────────────────

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

export interface ChurnFactor {
  feature: string;
  value: number | string;
  direction: "up" | "down"; // pushes risk up or down
  impact: number; // |SHAP|, sorted desc
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
  // lifecycle (observed, rule-based)
  lifecycle_stage: LifecycleStage;
  sub_stage: string;
  // descriptive (observed facts as of cutoff)
  days_since_last_activity: number | null;
  n_purchases: number;
  total_revenue: number;
  avg_transaction_value: number | null;
  ever_paid: boolean;
  usage_trend: "increasing" | "stable" | "declining" | "no_usage";
  profile_snapshot: ProfileSnapshot;
  // churn (model)
  churn_probability: number | null;
  churn_risk_level: RiskLevel | null;
  churn_factors: ChurnFactor[] | null;
  // clv (model)
  predicted_clv_6m: number | null;
  p_alive: number | null;
  customer_value_tier: ValueTier;
  // credit (model)
  predicted_credit_usage_30d: number | null;
  predicted_credit_usage_90d: number | null;
  credit_forecast_interval: { p10_30d: number; p90_30d: number; p10_90d: number; p90_90d: number } | null;
  estimated_days_until_topup: number | null;
  credit_urgency_level: UrgencyLevel | null;
  // derived business
  revenue_at_risk: number | null;
  priority_score: number;
  // AI (phase 2)
  ai_status: "not_requested" | "pending" | "completed" | "failed";
  ai_explanation: string | null;
  ai_recommended_message: string | null;
  // meta
  output_status: "predicted" | "partial" | "insufficient_data";
  model_eligibility: { churn: ModelEligibility; clv: ModelEligibility; credit: ModelEligibility };
  model_versions: { churn: string; clv: string; credit: string };
}

/** GET /prediction-runs/:id/summary — spec §4 */
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
  sort?: string; // e.g. "priority_score:desc"
  search?: string; // acc_id substring
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

// ── Model performance (spec §2.4) ──────────────────────────────

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

// ── Training runs (spec §2.6) ───────────────────────────────────

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

// ── Plumbing ────────────────────────────────────────────────────

function isApiError(data: unknown): data is { message: string } {
  return (
    typeof data === "object" && data !== null &&
    "message" in data && typeof (data as { message: unknown }).message === "string"
  );
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Unauthorized");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Request failed (${res.status})`);
  }
  return body as T;
}

async function sendJson<T>(url: string, method: string, payload?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Request failed (${res.status})`);
  }
  return body as T;
}

// Mock provider is loaded lazily so the real-API path never bundles it eagerly.
async function mock() {
  return import("@/mocks/ml");
}

// ── Client functions (spec §7) ──────────────────────────────────

export async function fetchPredictionRuns(): Promise<PredictionRun[]> {
  if (IS_ML_MOCK) return (await mock()).mockPredictionRuns();
  return getJson("/api/prediction-runs");
}

export async function createPredictionRun(input: {
  predict_source_id: string;
  name: string;
  cutoff_date?: string;
}): Promise<PredictionRun> {
  if (IS_ML_MOCK) return (await mock()).mockCreatePredictionRun(input);
  return sendJson("/api/prediction-runs", "POST", input);
}

export async function deletePredictionRun(id: string): Promise<void> {
  if (IS_ML_MOCK) {
    (await mock()).mockDeletePredictionRun(id);
    return;
  }
  await sendJson(`/api/prediction-runs/${id}`, "DELETE");
}

export async function retryPredictionRun(id: string): Promise<PredictionRun> {
  if (IS_ML_MOCK) return (await mock()).mockRetryPredictionRun(id);
  return sendJson(`/api/prediction-runs/${id}/retry`, "POST");
}

export async function fetchRunSummary(runId: string): Promise<RunSummary> {
  if (IS_ML_MOCK) return (await mock()).mockRunSummary(runId);
  return getJson(`/api/prediction-runs/${runId}/summary`);
}

export async function fetchRunOutputs(runId: string, q: OutputsQuery = {}): Promise<OutputsPage> {
  if (IS_ML_MOCK) return (await mock()).mockRunOutputs(runId, q);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  return getJson(`/api/prediction-runs/${runId}/outputs?${params.toString()}`);
}

export async function fetchRunOutput(runId: string, accId: number | string): Promise<PredictionOutput> {
  if (IS_ML_MOCK) return (await mock()).mockRunOutput(runId, Number(accId));
  return getJson(`/api/prediction-runs/${runId}/outputs/${accId}`);
}

export interface CustomerAiExplanationResult {
  acc_id: number;
  ai_status: PredictionOutput["ai_status"];
  ai_explanation: string | null;
  ai_model: string;
  ai_generated_at: string;
}

export async function generateCustomerAiExplanation(
  runId: string,
  accId: number | string,
  options: { force?: boolean } = {}
): Promise<CustomerAiExplanationResult> {
  if (IS_ML_MOCK) {
    return (await mock()).mockGenerateCustomerAiExplanation(runId, Number(accId), options);
  }
  return sendJson(
    `/api/prediction-runs/${runId}/outputs/${accId}/ai-explanation`,
    "POST",
    options
  );
}

export async function fetchCustomerUsageMonthly(
  runId: string,
  accId: number | string
): Promise<MonthlyUsagePoint[]> {
  if (IS_ML_MOCK) return (await mock()).mockUsageMonthly(runId, Number(accId));
  return getJson(`/api/prediction-runs/${runId}/customers/${accId}/usage-monthly`);
}

export async function fetchCustomerPayments(
  runId: string,
  accId: number | string
): Promise<PaymentEvent[]> {
  if (IS_ML_MOCK) return (await mock()).mockPayments(runId, Number(accId));
  return getJson(`/api/prediction-runs/${runId}/customers/${accId}/payments`);
}

/** GET /predict-data-sources/:id/suggested-cutoff — day after latest observed activity. */
export async function fetchPredictSuggestedCutoff(
  sourceId: string
): Promise<{ suggested_cutoff: string; latest_data_date: string | null }> {
  if (IS_ML_MOCK) return (await mock()).mockPredictSuggestedCutoff(sourceId);
  return getJson(`/api/predict-data-sources/${sourceId}/suggested-cutoff`);
}

/** GET /train-data-sources/:id/suggested-cutoff — Gate 3 feasible cutoff. */
export async function fetchTrainSuggestedCutoff(
  sourceId: string
): Promise<{ suggested_cutoff: string; latest_data_date: string; horizon_days: number }> {
  if (IS_ML_MOCK) return (await mock()).mockTrainSuggestedCutoff(sourceId);
  return getJson(`/api/train-data-sources/${sourceId}/suggested-cutoff`);
}

export async function fetchModelPerformance(): Promise<ModelPerfEntry[]> {
  if (IS_ML_MOCK) return (await mock()).mockModelPerformance();
  return getJson("/api/model-performance");
}

export async function fetchTrainingRuns(): Promise<TrainingRun[]> {
  if (IS_ML_MOCK) return (await mock()).mockTrainingRuns();
  return getJson("/api/training-runs");
}

export async function createTrainingRun(input: {
  train_source_id: string;
  dataset_name: string;
  cutoff_date?: string;
  horizon_days?: number;
}): Promise<TrainingRun> {
  if (IS_ML_MOCK) return (await mock()).mockCreateTrainingRun(input);
  return sendJson("/api/training-runs", "POST", input);
}

// ── Display helpers shared by views ─────────────────────────────

export const LIFECYCLE_STAGES: LifecycleStage[] = ["Active Paid", "Active Free", "Churned", "Ghost"];
export const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high", "critical"];
export const VALUE_TIERS: ValueTier[] = ["high", "mid", "low", "none"];
export const URGENCY_LEVELS: UrgencyLevel[] = ["critical", "warning", "monitor", "stable"];

/** Dashboard overview widget — keep in sync with apps/api/src/lib/ml-contract.ts */
export const TOP_PRIORITY_LIMIT = 5;
