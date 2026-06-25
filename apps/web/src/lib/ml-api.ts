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

// ── Re-export shared contract types from @moby/types ────────────────────────
export type {
  RunStatus,
  LifecycleStage,
  RiskLevel,
  ValueTier,
  UrgencyLevel,
} from "@moby/types";

export type {
  ChurnFactor,
  ModelEligibility,
  ProfileSnapshot,
  PredictionRun,
  PredictionOutput,
  RunSummary,
  OutputsQuery,
  OutputsPage,
  MonthlyUsagePoint,
  PaymentEvent,
  CustomerAiExplanationResult,
  RunInsight,
} from "@moby/types";

export type {
  SplitMetrics,
  ModelPerfEntry,
  CandidateResult,
  ModelVersionSummary,
} from "@moby/types";

export type {
  TrainingRunResult,
  TrainingRun,
} from "@moby/types";

export {
  LIFECYCLE_STAGES,
  RISK_LEVELS,
  VALUE_TIERS,
  URGENCY_LEVELS,
  TOP_PRIORITY_LIMIT,
} from "@moby/types";

// ── Local imports for internal use ──────────────────────────────────────────
import type {
  PredictionRun,
  PredictionOutput,
  RunSummary,
  OutputsQuery,
  OutputsPage,
  MonthlyUsagePoint,
  PaymentEvent,
  ModelPerfEntry,
  ModelVersionSummary,
  TrainingRun,
  CustomerAiExplanationResult,
  RunInsight,
} from "@moby/types";

// ── Plumbing ────────────────────────────────────────────────────────────────

import {
  IS_ML_MOCK,
  isApiError,
  loadMlMock as mock,
  redirectingFetch,
} from "./http";

// Re-exported so views can read the mock flag from `@/lib/ml-api`.
export { IS_ML_MOCK } from "./http";

async function getJson<T>(url: string): Promise<T> {
  const res = await redirectingFetch(url);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Request failed (${res.status})`);
  }
  return body as T;
}

// Note: mutations intentionally do not redirect on 401 (preserves prior behavior).
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

// ── Client functions (spec §7) ──────────────────────────────────────────────

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

/** GET /prediction-runs/:id/insight — cached AI base summary of the whole base. */
export async function fetchRunInsight(runId: string): Promise<RunInsight> {
  if (IS_ML_MOCK) return (await mock()).mockRunInsight(runId);
  return getJson(`/api/prediction-runs/${runId}/insight`);
}

/** POST /prediction-runs/:id/insight — generate or regenerate the base summary. */
export async function generateRunInsight(
  runId: string,
  options: { force?: boolean } = {}
): Promise<RunInsight> {
  if (IS_ML_MOCK) return (await mock()).mockGenerateRunInsight(runId, options);
  return sendJson(`/api/prediction-runs/${runId}/insight`, "POST", options);
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

/** GET /model-performance/:modelType/versions — all trained versions. */
export async function fetchModelVersions(modelType: string): Promise<ModelVersionSummary[]> {
  if (IS_ML_MOCK) return [];
  return getJson(`/api/model-performance/${modelType}/versions`);
}

/** POST /model-performance/:modelType/activate — pin a version to production. */
export async function activateModelVersion(
  modelType: string,
  modelVersionId: string,
  reason?: string
): Promise<{ ok: boolean }> {
  if (IS_ML_MOCK) return { ok: true };
  return sendJson(`/api/model-performance/${modelType}/activate`, "POST", {
    modelVersionId,
    reason,
  });
}

/** DELETE /model-performance/:modelType/versions/:id — remove a non-production version. */
export async function deleteModelVersion(
  modelType: string,
  modelVersionId: string
): Promise<{ deleted: boolean }> {
  if (IS_ML_MOCK) return { deleted: true };
  return sendJson(`/api/model-performance/${modelType}/versions/${modelVersionId}`, "DELETE");
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
