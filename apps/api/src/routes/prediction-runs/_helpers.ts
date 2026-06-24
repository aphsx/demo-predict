/**
 * Shared helpers for prediction-runs sub-routes.
 * Not a route file — imported by runs.ts, outputs.ts, summary.ts, customer-360.ts.
 */
import { and, eq, type SQL } from "drizzle-orm";
import { db } from "../../db/client";
import {
  mlPredictionOutputs,
  mlPredictionRuns,
  predictDataSources,
  user,
} from "../../db/schema";
import { requireOwnedForRead } from "../../lib/access-control";
import {
  EMPTY_MODEL_VERSIONS,
  num,
  type ChurnFactor,
  type LifecycleStage,
  type ModelEligibility,
  type PredictionOutput,
  type PredictionRun,
  type ProfileSnapshot,
  type RiskLevel,
  type RunStatus,
  type UrgencyLevel,
  type ValueTier,
} from "../../lib/ml-contract";
import { UUID_RE } from "../../lib/constants";

// ── Run select + row mapping ───────────────────────────────────

export const runSelect = {
  id: mlPredictionRuns.id,
  name: mlPredictionRuns.name,
  status: mlPredictionRuns.status,
  predictSourceId: mlPredictionRuns.predictSourceId,
  predictSourceName: predictDataSources.name,
  cutoffDate: mlPredictionRuns.cutoffDate,
  totalCustomers: mlPredictionRuns.totalCustomers,
  createdBy: mlPredictionRuns.createdBy,
  creatorName: user.name,
  createdAt: mlPredictionRuns.createdAt,
  finishedAt: mlPredictionRuns.finishedAt,
  errorMessage: mlPredictionRuns.errorMessage,
  progressJson: mlPredictionRuns.progressJson,
};

export interface RunRow {
  id: string;
  name: string;
  status: string;
  predictSourceId: string;
  predictSourceName: string | null;
  cutoffDate: string;
  totalCustomers: number | null;
  createdBy: string | null;
  creatorName: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
  progressJson: unknown;
}

export function mapRun(row: RunRow): PredictionRun {
  return {
    id: row.id,
    name: row.name,
    status: row.status as RunStatus,
    predict_source_id: row.predictSourceId,
    predict_source_name: row.predictSourceName ?? row.predictSourceId,
    cutoff_date: row.cutoffDate,
    total_customers: row.totalCustomers,
    created_by: row.creatorName ?? row.createdBy,
    created_at: row.createdAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
    error_message: row.errorMessage,
    progress:
      row.status === "in_progress"
        ? ((row.progressJson as { step: string; pct: number } | null) ?? null)
        : null,
  };
}

export async function fetchRun(id: string): Promise<RunRow | null> {
  if (!UUID_RE.test(id)) return null;
  const rows = await db
    .select(runSelect)
    .from(mlPredictionRuns)
    .leftJoin(predictDataSources, eq(mlPredictionRuns.predictSourceId, predictDataSources.id))
    .leftJoin(user, eq(mlPredictionRuns.createdBy, user.id))
    .where(eq(mlPredictionRuns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export function requireOwnedRun(
  run: RunRow | null,
  userId: string | null | undefined,
  set: { status?: number | string }
) {
  return requireOwnedForRead(run, run?.createdBy, userId, set, "Prediction run not found");
}

// ── Output row mapping ─────────────────────────────────────────

export const EMPTY_SNAPSHOT: ProfileSnapshot = {
  join_date: "",
  customer_age_days: 0,
  status_sms: null,
  status_email: null,
  credit_sms: 0,
  credit_email: 0,
  expire_sms: null,
  expire_email: null,
  last_access: null,
  last_send: null,
  sms_usage_share: 0,
  email_usage_share: 0,
  bc_usage_share: 0,
  api_usage_share: 0,
  otp_usage_share: 0,
  usage_total_180d: 0,
};

export const FALLBACK_ELIGIBILITY: ModelEligibility = {
  eligible: false,
  status: "not_eligible",
  reason: null,
};

export type OutputRow = typeof mlPredictionOutputs.$inferSelect;

export function mapOutput(row: OutputRow): PredictionOutput {
  const eligibility = row.modelEligibilityJson as {
    churn?: ModelEligibility;
    clv?: ModelEligibility;
    credit?: ModelEligibility;
  } | null;
  return {
    prediction_run_id: row.predictionRunId,
    acc_id: row.accId,
    lifecycle_stage: (row.lifecycleStage ?? "Ghost") as LifecycleStage,
    sub_stage: row.subStage ?? row.lifecycleStage ?? "Ghost",
    days_since_last_activity: row.daysSinceLastActivity,
    n_purchases: row.nPurchases ?? 0,
    total_revenue: num(row.totalRevenue) ?? 0,
    avg_transaction_value: num(row.avgTransactionValue),
    ever_paid: row.everPaid,
    usage_trend: (row.usageTrend ?? "no_usage") as PredictionOutput["usage_trend"],
    profile_snapshot: (row.profileSnapshotJson as ProfileSnapshot | null) ?? EMPTY_SNAPSHOT,
    churn_probability: num(row.churnProbability),
    churn_risk_level: (row.churnRiskLevel as RiskLevel | null) ?? null,
    churn_factors: (row.churnFactorsJson as ChurnFactor[] | null) ?? null,
    predicted_clv_6m: num(row.predictedClv6m),
    p_alive: num(row.pAlive),
    customer_value_tier: (row.customerValueTier ?? "none") as ValueTier,
    predicted_credit_usage_30d: num(row.predictedCreditUsage30d),
    predicted_credit_usage_90d: num(row.predictedCreditUsage90d),
    credit_forecast_interval:
      (row.creditForecastIntervalJson as PredictionOutput["credit_forecast_interval"]) ?? null,
    estimated_days_until_topup: row.estimatedDaysUntilTopup,
    credit_urgency_level: (row.creditUrgencyLevel as UrgencyLevel | null) ?? null,
    revenue_at_risk: num(row.revenueAtRisk),
    priority_score: num(row.priorityScore) ?? 0,
    segment: row.segment ?? null,
    action_rank: row.actionRank ?? null,
    needs_review: row.needsReview ?? false,
    ai_status: row.aiStatus as PredictionOutput["ai_status"],
    ai_explanation: row.aiExplanation,
    output_status: row.outputStatus as PredictionOutput["output_status"],
    model_eligibility: {
      churn: eligibility?.churn ?? FALLBACK_ELIGIBILITY,
      clv: eligibility?.clv ?? FALLBACK_ELIGIBILITY,
      credit: eligibility?.credit ?? FALLBACK_ELIGIBILITY,
    },
    model_versions:
      (row.modelVersionsJson as PredictionOutput["model_versions"] | null) ?? EMPTY_MODEL_VERSIONS,
  };
}

// ── Outputs query helpers ──────────────────────────────────────

export const SORT_COLUMNS = {
  priority_score: mlPredictionOutputs.priorityScore,
  lifecycle_stage: mlPredictionOutputs.lifecycleStage,
  churn_probability: mlPredictionOutputs.churnProbability,
  predicted_clv_6m: mlPredictionOutputs.predictedClv6m,
  revenue_at_risk: mlPredictionOutputs.revenueAtRisk,
  total_revenue: mlPredictionOutputs.totalRevenue,
  days_since_last_activity: mlPredictionOutputs.daysSinceLastActivity,
  estimated_days_until_topup: mlPredictionOutputs.estimatedDaysUntilTopup,
  action_rank: mlPredictionOutputs.actionRank,
  ai_status: mlPredictionOutputs.aiStatus,
  acc_id: mlPredictionOutputs.accId,
} as const;

export interface OutputsQueryParams {
  page?: number;
  page_size?: number;
  sort?: string;
  search?: string;
  lifecycle_stage?: string;
  churn_risk_level?: string;
  customer_value_tier?: string;
  credit_urgency_level?: string;
  ever_paid?: string;
  segment?: string;
  needs_review?: string;
}

export { mlPredictionOutputs, mlPredictionRuns, predictDataSources, user, db, eq, and };
