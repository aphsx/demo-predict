import Elysia, { t } from "elysia";
import { count, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { predictionRuns, rawCustomers } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { verifyRunOwnership } from "../lib/run-guard";
import { enqueueArqJob } from "../services/job-producer";

const MODEL_DIR = process.env.MODEL_DIR ?? "/app/models";

// Shape returned by POST /runs — matches FastAPI's RETURNING clause
const RUN_CREATE_RETURNING = {
  id: predictionRuns.id,
  name: predictionRuns.name,
  status: predictionRuns.status,
  cutoff_date: predictionRuns.cutoffDate,
  created_at: predictionRuns.createdAt,
} as const;

// Explicit snake_case select — matches FastAPI response shape exactly
const RUN_SELECT = {
  id: predictionRuns.id,
  name: predictionRuns.name,
  status: predictionRuns.status,
  cutoff_date: predictionRuns.cutoffDate,
  total_customers: predictionRuns.totalCustomers,
  active_customers: predictionRuns.activeCustomers,
  error_message: predictionRuns.errorMessage,
  model_version_id: predictionRuns.modelVersionId,
  user_id: predictionRuns.userId,
  data_start_date: predictionRuns.dataStartDate,
  data_end_date: predictionRuns.dataEndDate,
  created_at: predictionRuns.createdAt,
  updated_at: predictionRuns.updatedAt,
} as const;

export const runsRoutes = new Elysia({ prefix: "/runs" })
  .use(requireUser)

  // GET /runs — list the authenticated user's runs (newest first, max 50)
  .get("/", ({ userId }) =>
    db
      .select(RUN_SELECT)
      .from(predictionRuns)
      .where(eq(predictionRuns.userId, userId!))
      .orderBy(desc(predictionRuns.createdAt))
      .limit(50)
  )

  // POST /runs — create a new prediction run (status starts as "pending")
  .post(
    "/",
    async ({ body, userId }) => {
      const [newRun] = await db
        .insert(predictionRuns)
        .values({
          name: body.name,
          cutoffDate: body.cutoff_date,
          status: "pending",
          userId: userId!,
        })
        .returning(RUN_CREATE_RETURNING);
      return newRun;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        cutoff_date: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
      }),
    }
  )

  // GET /runs/:id — single run with ownership check
  .get(
    "/:id",
    async ({ params, userId, set }) => {
      const guard = await verifyRunOwnership(params.id, userId!);
      if (!guard.ok) {
        set.status = guard.status;
        return { message: guard.message };
      }
      const [run] = await db
        .select(RUN_SELECT)
        .from(predictionRuns)
        .where(eq(predictionRuns.id, params.id))
        .limit(1);
      return run;
    },
    { params: t.Object({ id: t.String() }) }
  )

  // POST /runs/:id/retry — re-enqueue pipeline for stuck processing/failed runs
  .post(
    "/:id/retry",
    async ({ params, userId, set }) => {
      const guard = await verifyRunOwnership(params.id, userId!);
      if (!guard.ok) {
        set.status = guard.status;
        return { message: guard.message };
      }

      const [run] = await db
        .select({ status: predictionRuns.status })
        .from(predictionRuns)
        .where(eq(predictionRuns.id, params.id))
        .limit(1);

      if (!run || !["processing", "failed"].includes(run.status)) {
        set.status = 400;
        return { message: `Run status is '${run?.status}' — cannot retry` };
      }

      const [row] = await db
        .select({ n: count() })
        .from(rawCustomers)
        .where(eq(rawCustomers.runId, params.id));

      if (!row?.n) {
        set.status = 400;
        return { message: "No uploaded data — upload Excel first" };
      }

      await db
        .update(predictionRuns)
        .set({ status: "processing", errorMessage: null })
        .where(eq(predictionRuns.id, params.id));

      try {
        await enqueueArqJob("run_prediction_pipeline", params.id, MODEL_DIR);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db
          .update(predictionRuns)
          .set({ status: "failed", errorMessage: `Queue error: ${msg}` })
          .where(eq(predictionRuns.id, params.id));
        set.status = 500;
        return { message: `Failed to enqueue prediction job: ${msg}` };
      }

      return { run_id: params.id, status: "processing", message: "Prediction re-queued" };
    },
    { params: t.Object({ id: t.String() }) }
  )

  // DELETE /runs/:id — ownership check then cascade-delete (FK cascade covers child tables)
  .delete(
    "/:id",
    async ({ params, userId, set }) => {
      const guard = await verifyRunOwnership(params.id, userId!);
      if (!guard.ok) {
        set.status = guard.status;
        return { message: guard.message };
      }
      await db
        .delete(predictionRuns)
        .where(eq(predictionRuns.id, params.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String() }) }
  );
