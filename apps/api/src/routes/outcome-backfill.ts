/**
 * Realized-outcome backfill trigger (TRAINING-PIPELINE §15).
 *
 * Admin-only: proxies to FastAPI /internal/outcome-backfill, which spawns
 * `python -m src.cli.backfill_outcomes`. The job finds completed prediction
 * runs whose horizon has elapsed relative to the newest clean predict data,
 * rebuilds actual labels, and upserts realized metrics into
 * ml_model_evaluations (evaluation_type='production_holdout'). Per-run
 * evidence (including failures) lands in ml_data_validation_reports.
 */
import Elysia, { t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { mlPredictionRuns } from "../db/schema";
import { requireAdmin } from "../lib/auth-middleware";
import { denyNotFound } from "../lib/access-control";
import { triggerMlJob } from "../lib/ml-internal";
import { RUN_STATUS, UUID_RE } from "../lib/constants";
import type { OutcomeBackfillResponse } from "@moby/types";

export const outcomeBackfillRoutes = new Elysia({ prefix: "/outcome-backfill" })
  .use(requireAdmin)
  .post(
    "/",
    async ({ body, set }) => {
      if (body.prediction_run_id !== undefined) {
        if (!UUID_RE.test(body.prediction_run_id)) {
          set.status = 400;
          return { message: "prediction_run_id must be a UUID" };
        }
        const [run] = await db
          .select({ id: mlPredictionRuns.id, status: mlPredictionRuns.status })
          .from(mlPredictionRuns)
          .where(eq(mlPredictionRuns.id, body.prediction_run_id))
          .limit(1);
        if (!run) return denyNotFound(set, "Prediction run not found");
        if (run.status !== RUN_STATUS.COMPLETED) {
          set.status = 400;
          return { message: "Only completed prediction runs can be measured against realized outcomes" };
        }
      }

      try {
        await triggerMlJob("/internal/outcome-backfill", {
          prediction_run_id: body.prediction_run_id ?? null,
          force: body.force ?? false,
        });
      } catch (e) {
        // No run row owns this job's status — surface the trigger failure to
        // the caller instead of pretending the backfill was accepted.
        set.status = 502;
        return { message: (e as Error).message };
      }

      const response: OutcomeBackfillResponse = {
        accepted: true,
        prediction_run_id: body.prediction_run_id ?? null,
        force: body.force ?? false,
      };
      return response;
    },
    {
      body: t.Object({
        prediction_run_id: t.Optional(t.String()),
        force: t.Optional(t.Boolean()),
      }),
    }
  );
