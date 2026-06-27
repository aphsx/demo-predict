import Elysia, { t } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { mlPredictionRuns, predictDataSources, user } from "../../db/schema";
import { requireUser } from "../../lib/auth-middleware";
import { triggerMlJob } from "../../lib/ml-internal";
import { denyNotFound } from "../../lib/access-control";
import { getPredictCutoffSuggestion } from "../../lib/clean-cutoff";
import { DATE_RE, UUID_RE } from "../../lib/constants";
import { fetchRun, mapRun, requireOwnedRun, runSelect } from "./_helpers";

export const runsRoutes = new Elysia()
  .use(requireUser)
  .get("/", async ({ userId }) => {
    const rows = await db
      .select(runSelect)
      .from(mlPredictionRuns)
      .leftJoin(predictDataSources, eq(mlPredictionRuns.predictSourceId, predictDataSources.id))
      .leftJoin(user, eq(mlPredictionRuns.createdBy, user.id))
      .where(eq(mlPredictionRuns.createdBy, userId!))
      .orderBy(desc(mlPredictionRuns.createdAt));
    return rows.map(mapRun);
  })
  .post(
    "/",
    async ({ body, userId, set }) => {
      if (!UUID_RE.test(body.predict_source_id)) {
        set.status = 400;
        return { message: "predict_source_id must be a UUID" };
      }
      if (body.cutoff_date !== undefined && !DATE_RE.test(body.cutoff_date)) {
        set.status = 400;
        return { message: "cutoff_date must be YYYY-MM-DD" };
      }
      const [source] = await db
        .select({ id: predictDataSources.id, importStatus: predictDataSources.importStatus })
        .from(predictDataSources)
        .where(and(eq(predictDataSources.id, body.predict_source_id), eq(predictDataSources.importedBy, userId!)))
        .limit(1);
      if (!source) return denyNotFound(set, "Predict data source not found");
      if (source.importStatus !== "ready") {
        set.status = 400;
        return { message: "Predict data source must be ready before prediction" };
      }
      const suggested = await getPredictCutoffSuggestion(body.predict_source_id);
      const cutoffDate = body.cutoff_date ?? suggested.cutoff_date;
      if (!cutoffDate) {
        set.status = 400;
        return { message: "No clean activity data for this source yet" };
      }

      const [inserted] = await db
        .insert(mlPredictionRuns)
        .values({
          predictSourceId: body.predict_source_id,
          name: body.name,
          cutoffDate,
          status: "pending",
          createdBy: userId!,
        })
        .returning({ id: mlPredictionRuns.id });

      try {
        await triggerMlJob("/internal/prediction-runs", { prediction_run_id: inserted.id });
      } catch (e) {
        await db
          .update(mlPredictionRuns)
          .set({ status: "failed", errorMessage: (e as Error).message })
          .where(eq(mlPredictionRuns.id, inserted.id));
      }

      const run = await fetchRun(inserted.id);
      return mapRun(run!);
    },
    {
      body: t.Object({
        predict_source_id: t.String(),
        name: t.String({ minLength: 1 }),
        cutoff_date: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/:id",
    async ({ params, userId, set }) => {
      const run = await fetchRun(params.id);
      const denied = requireOwnedRun(run, userId, set);
      if (denied) return denied;
      return mapRun(run!);
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/:id/retry",
    async ({ params, userId, set }) => {
      const run = await fetchRun(params.id);
      const denied = requireOwnedRun(run, userId, set);
      if (denied) return denied;
      if (run!.status !== "failed") {
        set.status = 400;
        return { message: "Only failed runs can be retried" };
      }

      await db
        .update(mlPredictionRuns)
        .set({ status: "pending", errorMessage: null, progressJson: null })
        .where(eq(mlPredictionRuns.id, run!.id));

      try {
        await triggerMlJob("/internal/prediction-runs", { prediction_run_id: run!.id });
      } catch (e) {
        await db
          .update(mlPredictionRuns)
          .set({ status: "failed", errorMessage: (e as Error).message })
          .where(eq(mlPredictionRuns.id, run!.id));
      }

      const fresh = await fetchRun(run!.id);
      return mapRun(fresh!);
    },
    { params: t.Object({ id: t.String() }) }
  )
  .delete(
    "/:id",
    async ({ params, userId, set }) => {
      const run = await fetchRun(params.id);
      const denied = requireOwnedRun(run, userId, set);
      if (denied) return denied;
      await db.delete(mlPredictionRuns).where(eq(mlPredictionRuns.id, run!.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String() }) }
  );
