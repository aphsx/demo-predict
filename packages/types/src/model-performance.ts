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
