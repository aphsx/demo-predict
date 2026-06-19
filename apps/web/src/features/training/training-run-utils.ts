import type { TrainingRunResult } from "@/lib/ml-api";

// Run status tone/label live in the shared module (single source for runs + training).
export { runStatusTone, runStatusLabel } from "@/lib/run-status";

export const DEFAULT_HORIZON_DAYS = 180;

export const MODEL_TYPE_LABELS: Record<TrainingRunResult["model_type"], string> = {
  churn: "Churn",
  clv: "CLV",
  credit: "Credit",
};

/** Fallback cutoff = today minus the default horizon (used until the Gate 3 suggestion loads). */
export function defaultCutoffDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - DEFAULT_HORIZON_DAYS);
  return d.toISOString().slice(0, 10);
}

/** 0.712 → "0.712", 0.5700 → "0.57" */
export function formatMetric(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function beatsBaseline(result: TrainingRunResult): boolean {
  return result.primary_metric_value > result.baseline_value;
}

/** Compact summary for the history table, e.g. "churn PR-AUC 0.712 ✓" */
export function primaryResultSummary(results: TrainingRunResult[] | null): string | null {
  if (!results || results.length === 0) return null;
  const primary = results.find((r) => r.model_type === "churn") ?? results[0];
  return `${primary.model_type} ${primary.primary_metric_name} ${formatMetric(primary.primary_metric_value)} ${
    beatsBaseline(primary) ? "✓" : "✗"
  }`;
}

/** "3/3 promoted" */
export function promotedSummary(results: TrainingRunResult[] | null): string | null {
  if (!results || results.length === 0) return null;
  const promoted = results.filter((r) => r.promoted).length;
  return `${promoted}/${results.length} promoted`;
}
