/**
 * Realized-outcome loop (docs/ML-V2-TRAINING-PIPELINE.md §15).
 *
 * After a prediction run's horizon has elapsed and newer clean data covers the
 * window, the backfill job rebuilds actual labels (same definitions as
 * training) and persists realized metrics as ml_model_evaluations rows with
 * evaluation_type='production_holdout' linked to the run.
 */
/** The three served ML models (lifecycle is rule-based and has no outcome). */
export type RealizedModelType = "churn" | "clv" | "credit";

/** Calibration curve stored alongside realized churn metrics. */
export interface RealizedCalibration {
  prob_pred: number[];
  prob_true: number[];
  ece: number;
}

export interface RealizedLiftRow {
  decile: number;
  share_of_churners: number;
  lift: number;
}

/** Measurement context persisted in business_metrics_json (snake_case keys). */
export interface RealizedOutcomeContext {
  actuals_source_id?: string;
  actuals_max_activity_date?: string;
  predicted_customers?: number;
  label_population?: number;
  matched_customers?: number;
  threshold?: number;
  threshold_source?: string;
  realized_churn_rate?: number;
  realized_total_revenue?: number;
  predicted_total_clv?: number;
  horizons_elapsed?: number[];
  [key: string]: unknown;
}

/** One model's realized (production_holdout) evaluation for a prediction run. */
export interface RealizedOutcome {
  model_type: RealizedModelType;
  model_version_id: string;
  /** Version string of the served model (null if the version row was deleted). */
  model_version: string | null;
  evaluation_type: "production_holdout";
  cutoff_date: string | null;
  horizon_days: number | null;
  /** Same metric keys as training-time evaluations (metrics_json). */
  metrics: Record<string, number>;
  context: RealizedOutcomeContext | null;
  confusion_matrix: Record<string, number> | null;
  calibration: RealizedCalibration | null;
  lift_table: RealizedLiftRow[] | null;
  measured_at: string;
}

/** GET /prediction-runs/:id/realized-outcomes */
export interface RealizedOutcomesResponse {
  prediction_run_id: string;
  cutoff_date: string;
  /** True once the backfill job has persisted at least one realized metric. */
  evaluated: boolean;
  outcomes: RealizedOutcome[];
}

/** POST /outcome-backfill (admin) */
export interface OutcomeBackfillRequest {
  /** Measure one specific completed run; omit to backfill every eligible run. */
  prediction_run_id?: string;
  /** Re-measure runs that already have production_holdout evaluations. */
  force?: boolean;
}

export interface OutcomeBackfillResponse {
  accepted: boolean;
  prediction_run_id: string | null;
  force: boolean;
}
