/**
 * Realized outcomes for one prediction run (TRAINING-PIPELINE §15).
 *
 * The outcome-backfill job (apps/ml/src/outcomes/) writes production_holdout
 * rows into ml_model_evaluations linked to the run via prediction_run_id.
 * This route only reads what the ML side persisted — no metric math here.
 */
import Elysia, { t } from "elysia";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { mlModelEvaluations, mlModelVersions } from "../../db/schema";
import { requireUser } from "../../lib/auth-middleware";
import type {
  RealizedOutcome,
  RealizedOutcomesResponse,
} from "@moby/types";
import { fetchRun, requireRunFound } from "./_helpers";

/** Must match PRODUCTION_HOLDOUT_EVALUATION_TYPE in apps/ml/src/outcomes/runner.py. */
const PRODUCTION_HOLDOUT_EVALUATION_TYPE = "production_holdout";

export const realizedOutcomesRoutes = new Elysia()
  .use(requireUser)
  // Org-wide read: realized metrics are shared evidence, like run outputs.
  .get(
    "/:id/realized-outcomes",
    async ({ params, set }) => {
      const run = await fetchRun(params.id);
      const denied = requireRunFound(run, set);
      if (denied) return denied;

      const rows = await db
        .select({
          modelType: mlModelEvaluations.modelType,
          modelVersionId: mlModelEvaluations.modelVersionId,
          modelVersion: mlModelVersions.version,
          cutoffDate: mlModelEvaluations.cutoffDate,
          horizonDays: mlModelEvaluations.horizonDays,
          metricsJson: mlModelEvaluations.metricsJson,
          businessMetricsJson: mlModelEvaluations.businessMetricsJson,
          confusionMatrixJson: mlModelEvaluations.confusionMatrixJson,
          calibrationJson: mlModelEvaluations.calibrationJson,
          liftTableJson: mlModelEvaluations.liftTableJson,
          createdAt: mlModelEvaluations.createdAt,
        })
        .from(mlModelEvaluations)
        .leftJoin(mlModelVersions, eq(mlModelEvaluations.modelVersionId, mlModelVersions.id))
        .where(
          and(
            eq(mlModelEvaluations.predictionRunId, run!.id),
            eq(mlModelEvaluations.evaluationType, PRODUCTION_HOLDOUT_EVALUATION_TYPE)
          )
        )
        .orderBy(asc(mlModelEvaluations.modelType));

      const outcomes: RealizedOutcome[] = rows.map((row) => ({
        model_type: row.modelType as RealizedOutcome["model_type"],
        model_version_id: row.modelVersionId,
        model_version: row.modelVersion ?? null,
        evaluation_type: PRODUCTION_HOLDOUT_EVALUATION_TYPE,
        cutoff_date: row.cutoffDate,
        horizon_days: row.horizonDays,
        metrics: (row.metricsJson as Record<string, number> | null) ?? {},
        context: (row.businessMetricsJson as RealizedOutcome["context"]) ?? null,
        confusion_matrix: (row.confusionMatrixJson as Record<string, number> | null) ?? null,
        calibration: (row.calibrationJson as RealizedOutcome["calibration"]) ?? null,
        lift_table: (row.liftTableJson as RealizedOutcome["lift_table"]) ?? null,
        measured_at: row.createdAt.toISOString(),
      }));

      const response: RealizedOutcomesResponse = {
        prediction_run_id: run!.id,
        cutoff_date: run!.cutoffDate,
        evaluated: outcomes.length > 0,
        outcomes,
      };
      return response;
    },
    { params: t.Object({ id: t.String() }) }
  );
