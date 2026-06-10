/**
 * Mock values for UI preview only.
 * Replace with values from ml_model_evaluations once backend evaluation is wired.
 */

export type SummaryMetric = {
  model: "Lifecycle" | "Churn" | "CLV" | "Credit";
  method: string;
  algorithm: string;
  primaryMetric: {
    label: string;
    value: string;
  };
  metrics: readonly {
    label: string;
    value: string;
  }[];
  note?: string;
};

const SUMMARY_METRICS: SummaryMetric[] = [
  {
    model: "Lifecycle",
    method: "Rule-based classification",
    algorithm: "Deterministic rules",
    primaryMetric: {
      label: "Rule coverage",
      value: "100%",
    },
    metrics: [
      { label: "Unknown rate", value: "0.0%" },
      { label: "Rule conflicts", value: "0" },
      { label: "Stages", value: "4" },
    ],
    note: "Rules: Ghost=no history, Churned=no activity in 180d, Paid=active+paid, Free=active+no paid.",
  },
  {
    model: "Churn",
    method: "ML classification",
    algorithm: "Calibrated LightGBM",
    primaryMetric: {
      label: "F1 score",
      value: "0.711",
    },
    metrics: [
      { label: "Precision", value: "0.681" },
      { label: "Recall", value: "0.744" },
      { label: "PR-AUC", value: "0.712" },
      { label: "Lift@top10%", value: "3.12x" },
    ],
  },
  {
    model: "CLV",
    method: "Regression + ranking",
    algorithm: "BG-NBD + Gamma-Gamma / ML regressors",
    primaryMetric: {
      label: "MAE",
      value: "฿1,181",
    },
    metrics: [
      { label: "SMAPE", value: "31.8%" },
      { label: "Spearman", value: "0.570" },
      { label: "Top-decile capture", value: "44.0%" },
    ],
  },
  {
    model: "Credit",
    method: "Forecasting regression",
    algorithm: "LightGBM quantile regressor",
    primaryMetric: {
      label: "SMAPE 90d",
      value: "33.7%",
    },
    metrics: [
      { label: "MAE 90d", value: "2,380" },
      { label: "SMAPE 30d", value: "28.4%" },
      { label: "Coverage", value: "79.0%" },
      { label: "Urgent recall", value: "0.730" },
    ],
  },
];

export async function getModelMetrics(): Promise<SummaryMetric[]> {
  return SUMMARY_METRICS;
}
