export interface SplitMetrics {
  split: "validation" | "test" | "backtest_avg";
  metrics: Record<string, number>;
}

/**
 * One competing candidate from a training run's model competition. The champion
 * (is_champion) is the version currently promoted to the `production` alias;
 * the others were trained and ranked in the same run but not promoted.
 */
export interface CandidateResult {
  algorithm: string;
  cv_score: number | null;
  cv_metric: string;
  test_score?: number | null;
  gate_passed?: boolean;
  is_champion: boolean;
  reason?: string;
}

/** A trained model version, for the production-override version picker. */
export interface ModelVersionSummary {
  id: string;
  model_type: string;
  version: string;
  algorithm: string;
  status: string;
  is_active: boolean;
  trained_at: string | null;
  primary_metric_name: string;
  primary_metric_value: number | null;
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
  competition?: CandidateResult[];
  thresholds?: Record<string, number>;
  calibration?: { prob_pred: number[]; prob_true: number[]; ece: number };
  confusion?: { tp: number; fp: number; fn: number; tn: number; threshold: number };
  lift_table?: { decile: number; share_of_churners: number; lift: number }[];
  notes?: string;
}
