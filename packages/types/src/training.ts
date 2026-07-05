import type { RunStatus } from "./enums";

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
  /** Creator's user id (null when the creator's account was deleted). */
  created_by: string | null;
  /** Creator's display name, falling back to email. */
  created_by_name: string | null;
  error_message: string | null;
  progress: { phase: string; pct: number } | null;
  results: TrainingRunResult[] | null;
}
