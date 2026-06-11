/**
 * [NEW] ML v2 model performance API — docs/ML-V2-DASHBOARD-SPEC.md §2.4/§7.
 * Champion (alias='production') per model type + holdout/backtest evaluations
 * and baselines from ml_model_evaluations. Contract: apps/web/src/lib/mlApi.ts.
 */
import Elysia from "elysia";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { mlModelAliases, mlModelEvaluations, mlModelVersions } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { DEFAULT_RISK_THRESHOLDS, type ModelPerfEntry, type SplitMetrics } from "../lib/ml-contract";

const MODEL_TYPES = ["churn", "clv", "credit"] as const;

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

export const modelPerformanceRoutes = new Elysia({ prefix: "/model-performance" })
  .use(requireUser)
  .get("/", async (): Promise<ModelPerfEntry[]> => {
    const entries: ModelPerfEntry[] = [LIFECYCLE_ENTRY];
    for (const modelType of MODEL_TYPES) {
      const entry = await buildEntry(modelType);
      if (entry) entries.push(entry);
    }
    return entries;
  });
