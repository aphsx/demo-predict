/**
 * [NEW] ML v2 model performance API — docs/ML-V2-DASHBOARD-SPEC.md §2.4/§7.
 * Champion (alias='production') per model type + holdout/backtest evaluations
 * and baselines from ml_model_evaluations. Contract: apps/web/src/lib/mlApi.ts.
 */
import Elysia from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { mlModelAliases, mlModelEvaluations, mlModelVersions } from "../db/schema";
import { requireAdmin, requireUser } from "../lib/auth-middleware";
import {
  DEFAULT_RISK_THRESHOLDS,
  type CandidateResult,
  type ModelPerfEntry,
  type ModelVersionSummary,
  type SplitMetrics,
} from "../lib/ml-contract";
import { triggerMlJob } from "../lib/ml-internal";

const MODEL_TYPES = ["churn", "clv", "credit"] as const;
type ModelType = (typeof MODEL_TYPES)[number];

// Primary headline metric per model type, read from a version's test metrics.
const PRIMARY_METRIC: Record<ModelType, { key: string; name: string }> = {
  churn: { key: "pr_auc", name: "PR-AUC" },
  clv: { key: "spearman", name: "Spearman" },
  credit: { key: "coverage_p10_p90", name: "Coverage p10–p90" },
};

function isModelType(value: string): value is ModelType {
  return (MODEL_TYPES as readonly string[]).includes(value);
}

const LIFECYCLE_ENTRY: ModelPerfEntry = {
  model_type: "lifecycle",
  method: "Rule-based classification",
  algorithm: "Deterministic rules (features.py)",
  version: null,
  trained_at: null,
  cutoff_date: null,
  dataset_rows: null,
  feature_set: null,
  primary_metric: { name: "Rule coverage", value: "100%" },
  splits: [],
  baselines: [],
  notes: "ไม่ใช่โมเดล ML — กติกาแบ่ง Ghost / Churned / Active Free / Active Paid จากข้อมูลจริง",
};

interface SelectionEntry {
  candidate?: string;
  cv_pr_auc?: number;
  test_pr_auc?: number;
  gate_passed?: boolean;
  reason?: string;
}

interface ModelCard {
  method?: string;
  algorithm?: string;
  cutoff_date?: string;
  dataset_rows?: number;
  feature_set?: string;
  thresholds?: Record<string, number>;
  primary_metric?: {
    name?: string;
    value?: number | string;
    baseline?: number;
    baseline_name?: string;
  };
  // Candidate competition snapshots (present per model type that runs one).
  candidate_competition_cv_pr_auc?: Record<string, number>;
  candidate_competition_val_spearman?: Record<string, number>;
  candidate_selection?: SelectionEntry[];
}

/** Rebuild the candidate competition (ranked, champion-flagged) from a card. */
function buildCompetition(card: ModelCard): CandidateResult[] | undefined {
  const churn = card.candidate_competition_cv_pr_auc;
  const clv = card.candidate_competition_val_spearman;
  const scores = churn ?? clv;
  if (!scores || Object.keys(scores).length === 0) return undefined;
  const cvMetric = churn ? "CV PR-AUC" : "Val Spearman";

  const selection = new Map<string, SelectionEntry>();
  for (const entry of card.candidate_selection ?? []) {
    if (entry.candidate) selection.set(entry.candidate, entry);
  }

  const results: CandidateResult[] = Object.entries(scores).map(([algorithm, cvScore]) => {
    const sel = selection.get(algorithm);
    const isChampion = algorithm === card.algorithm;
    return {
      algorithm,
      cv_score: cvScore,
      cv_metric: cvMetric,
      test_score: sel?.test_pr_auc ?? null,
      gate_passed: sel?.gate_passed,
      is_champion: isChampion,
      reason: isChampion ? sel?.reason : undefined,
    };
  });
  results.sort((a, b) => (b.cv_score ?? 0) - (a.cv_score ?? 0));
  return results;
}

type EvaluationRow = typeof mlModelEvaluations.$inferSelect;

function asMetrics(json: unknown): Record<string, number> {
  return (json as Record<string, number> | null) ?? {};
}

/** Average each numeric metric key across backtest evaluation rows. */
function averageMetrics(rows: EvaluationRow[]): Record<string, number> {
  const sums = new Map<string, { total: number; n: number }>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(asMetrics(row.metricsJson))) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const entry = sums.get(key) ?? { total: 0, n: 0 };
      entry.total += value;
      entry.n += 1;
      sums.set(key, entry);
    }
  }
  const avg: Record<string, number> = {};
  for (const [key, { total, n }] of sums) avg[key] = total / n;
  return avg;
}

async function buildEntry(modelType: (typeof MODEL_TYPES)[number]): Promise<ModelPerfEntry | null> {
  const [champion] = await db
    .select({
      id: mlModelVersions.id,
      version: mlModelVersions.version,
      trainedAt: mlModelVersions.trainedAt,
      modelCardJson: mlModelVersions.modelCardJson,
    })
    .from(mlModelAliases)
    .innerJoin(mlModelVersions, eq(mlModelAliases.modelVersionId, mlModelVersions.id))
    .where(and(eq(mlModelAliases.alias, "production"), eq(mlModelAliases.modelType, modelType)))
    .limit(1);
  if (!champion) return null;

  const card = (champion.modelCardJson as ModelCard | null) ?? {};
  const evaluations = await db
    .select()
    .from(mlModelEvaluations)
    .where(eq(mlModelEvaluations.modelVersionId, champion.id));

  const holdout = evaluations.filter(
    (row) => row.baselineName === null && row.evaluationType === "holdout"
  );
  const backtests = evaluations.filter(
    (row) => row.baselineName === null && row.evaluationType === "backtest"
  );

  const splits: SplitMetrics[] = [];
  for (const split of ["validation", "test"] as const) {
    const row = holdout.find((r) => r.datasetSplit === split);
    if (row) splits.push({ split, metrics: asMetrics(row.metricsJson) });
  }
  if (backtests.length > 0) {
    splits.push({ split: "backtest_avg", metrics: averageMetrics(backtests) });
  }

  const baselines = evaluations
    .filter((row) => row.baselineName !== null && row.datasetSplit === "test")
    .map((row) => ({ name: row.baselineName as string, metrics: asMetrics(row.metricsJson) }));

  const entry: ModelPerfEntry = {
    model_type: modelType,
    method: card.method ?? "",
    algorithm: card.algorithm ?? "",
    version: champion.version,
    trained_at: champion.trainedAt?.toISOString() ?? null,
    cutoff_date: card.cutoff_date ?? null,
    dataset_rows: card.dataset_rows ?? null,
    feature_set: card.feature_set ?? null,
    primary_metric: {
      name: card.primary_metric?.name ?? "",
      value: card.primary_metric?.value ?? "",
      ...(card.primary_metric?.baseline !== undefined
        ? { baseline: card.primary_metric.baseline }
        : {}),
      ...(card.primary_metric?.baseline_name !== undefined
        ? { baseline_name: card.primary_metric.baseline_name }
        : {}),
    },
    splits,
    baselines,
  };

  const competition = buildCompetition(card);
  if (competition) entry.competition = competition;

  if (modelType === "churn") {
    entry.thresholds = card.thresholds ?? { ...DEFAULT_RISK_THRESHOLDS };
    const testRow = holdout.find((r) => r.datasetSplit === "test");
    if (testRow) {
      const calibration = testRow.calibrationJson as ModelPerfEntry["calibration"] | null;
      const confusion = testRow.confusionMatrixJson as ModelPerfEntry["confusion"] | null;
      const liftTable = testRow.liftTableJson as ModelPerfEntry["lift_table"] | null;
      if (calibration) entry.calibration = calibration;
      if (confusion) entry.confusion = confusion;
      if (liftTable) entry.lift_table = liftTable;
    }
  } else if (card.thresholds) {
    entry.thresholds = card.thresholds;
  }

  return entry;
}

interface VersionCard {
  algorithm?: string;
}

// Champion pinning and version deletion change what every user is served —
// admin only, same pattern as data imports and training runs.
const adminModelPerformanceRoutes = new Elysia()
  .use(requireAdmin)
  // Manually pin a version to production. Reuses the ML service's promotion
  // transaction (action='manual_override') so the registry stays consistent.
  .post("/:modelType/activate", async ({ params, body, userId, set }) => {
    if (!isModelType(params.modelType)) {
      set.status = 400;
      return { message: "Unknown model type" };
    }
    const { modelVersionId, reason } = (body ?? {}) as {
      modelVersionId?: string;
      reason?: string;
    };
    if (!modelVersionId) {
      set.status = 400;
      return { message: "modelVersionId is required" };
    }
    try {
      await triggerMlJob("/internal/model-activate", {
        model_type: params.modelType,
        model_version_id: modelVersionId,
        reason,
        created_by: userId ?? null,
      });
    } catch (error) {
      set.status = 502;
      return { message: error instanceof Error ? error.message : "Activation failed" };
    }
    return { ok: true };
  })
  // Permanently delete a non-production model version (artifacts + registry row).
  // The ML service refuses to delete the current production champion.
  .delete("/:modelType/versions/:id", async ({ params, userId, set }) => {
    if (!isModelType(params.modelType)) {
      set.status = 400;
      return { message: "Unknown model type" };
    }
    if (!params.id) {
      set.status = 400;
      return { message: "model version id is required" };
    }
    try {
      await triggerMlJob("/internal/model-delete", {
        model_type: params.modelType,
        model_version_id: params.id,
        created_by: userId ?? null,
      });
    } catch (error) {
      // The ML service rejects deleting the production champion with HTTP 400 —
      // surface that as 409 Conflict (a state error), not a 502 gateway error.
      const upstream = (error as { upstreamStatus?: number }).upstreamStatus;
      set.status = upstream === 400 ? 409 : 502;
      return { message: error instanceof Error ? error.message : "Delete failed" };
    }
    return { deleted: true };
  });

export const modelPerformanceRoutes = new Elysia({ prefix: "/model-performance" })
  .use(requireUser)
  .get("/", async (): Promise<ModelPerfEntry[]> => {
    const entries: ModelPerfEntry[] = [LIFECYCLE_ENTRY];
    for (const modelType of MODEL_TYPES) {
      const entry = await buildEntry(modelType);
      if (entry) entries.push(entry);
    }
    return entries;
  })
  // All trained versions for a model type — fuels the production-override picker.
  .get("/:modelType/versions", async ({ params, set }): Promise<ModelVersionSummary[]> => {
    if (!isModelType(params.modelType)) {
      set.status = 400;
      return [];
    }
    const primary = PRIMARY_METRIC[params.modelType];
    const rows = await db
      .select({
        id: mlModelVersions.id,
        version: mlModelVersions.version,
        status: mlModelVersions.status,
        isActive: mlModelVersions.isActive,
        trainedAt: mlModelVersions.trainedAt,
        modelCardJson: mlModelVersions.modelCardJson,
        testMetricsJson: mlModelVersions.testMetricsJson,
      })
      .from(mlModelVersions)
      .where(eq(mlModelVersions.modelType, params.modelType))
      .orderBy(desc(mlModelVersions.trainedAt));

    return rows.map((row) => {
      const metricValue = asMetrics(row.testMetricsJson)[primary.key];
      return {
        id: row.id,
        model_type: params.modelType,
        version: row.version,
        algorithm: (row.modelCardJson as VersionCard | null)?.algorithm ?? "",
        status: row.status,
        is_active: row.isActive,
        trained_at: row.trainedAt?.toISOString() ?? null,
        primary_metric_name: primary.name,
        primary_metric_value: typeof metricValue === "number" ? metricValue : null,
      };
    });
  })
  .use(adminModelPerformanceRoutes);
