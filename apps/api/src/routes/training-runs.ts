/**
 * [NEW] ML v2 training runs API — docs/ML-V2-DASHBOARD-SPEC.md §2.6/§7.
 * Response contract mirrors apps/web/src/lib/mlApi.ts (snake_case keys).
 */
import Elysia, { t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { mlTrainingRuns, trainDataSources, user } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { triggerMlJob } from "../lib/ml-internal";
import {
  UUID_RE,
  type RunStatus,
  type TrainingRun,
  type TrainingRunResult,
} from "../lib/ml-contract";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const runSelect = {
  id: mlTrainingRuns.id,
  status: mlTrainingRuns.status,
  datasetName: trainDataSources.name,
  cutoffDate: mlTrainingRuns.cutoffDate,
  horizonDays: mlTrainingRuns.horizonDays,
  startedAt: mlTrainingRuns.startedAt,
  finishedAt: mlTrainingRuns.finishedAt,
  createdBy: mlTrainingRuns.createdBy,
  creatorName: user.name,
  createdAt: mlTrainingRuns.createdAt,
  errorMessage: mlTrainingRuns.errorMessage,
  progressJson: mlTrainingRuns.progressJson,
  resultsJson: mlTrainingRuns.resultsJson,
};

interface TrainingRunRow {
  id: string;
  status: string;
  datasetName: string | null;
  cutoffDate: string;
  horizonDays: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdBy: string | null;
  creatorName: string | null;
  createdAt: Date;
  errorMessage: string | null;
  progressJson: unknown;
  resultsJson: unknown;
}

function mapTrainingRun(row: TrainingRunRow): TrainingRun {
  return {
    id: row.id,
    status: row.status as RunStatus,
    dataset_name: row.datasetName ?? "dataset",
    cutoff_date: row.cutoffDate,
    horizon_days: row.horizonDays,
    started_at: (row.startedAt ?? row.createdAt).toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
    created_by: row.creatorName ?? row.createdBy,
    error_message: row.errorMessage,
    progress:
      row.status === "in_progress"
        ? ((row.progressJson as { phase: string; pct: number } | null) ?? null)
        : null,
    results: (row.resultsJson as TrainingRunResult[] | null) ?? null,
  };
}

async function fetchTrainingRun(id: string): Promise<TrainingRunRow | null> {
  if (!UUID_RE.test(id)) return null;
  const rows = await db
    .select(runSelect)
    .from(mlTrainingRuns)
    .leftJoin(trainDataSources, eq(mlTrainingRuns.sourceId, trainDataSources.id))
    .leftJoin(user, eq(mlTrainingRuns.createdBy, user.id))
    .where(eq(mlTrainingRuns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export const trainingRunRoutes = new Elysia({ prefix: "/training-runs" })
  .use(requireUser)
  .get("/", async () => {
    const rows = await db
      .select(runSelect)
      .from(mlTrainingRuns)
      .leftJoin(trainDataSources, eq(mlTrainingRuns.sourceId, trainDataSources.id))
      .leftJoin(user, eq(mlTrainingRuns.createdBy, user.id))
      .orderBy(desc(mlTrainingRuns.createdAt));
    return rows.map(mapTrainingRun);
  })
  .post(
    "/",
    async ({ body, userId, set }) => {
      if (!UUID_RE.test(body.train_source_id)) {
        set.status = 400;
        return { message: "train_source_id must be a UUID" };
      }
      if (!DATE_RE.test(body.cutoff_date)) {
        set.status = 400;
        return { message: "cutoff_date must be YYYY-MM-DD" };
      }
      const [source] = await db
        .select({ id: trainDataSources.id })
        .from(trainDataSources)
        .where(eq(trainDataSources.id, body.train_source_id))
        .limit(1);
      if (!source) {
        set.status = 404;
        return { message: "Train data source not found" };
      }

      const [inserted] = await db
        .insert(mlTrainingRuns)
        .values({
          sourceId: body.train_source_id,
          cutoffDate: body.cutoff_date,
          horizonDays: body.horizon_days ?? 180,
          status: "pending",
          createdBy: userId!,
        })
        .returning({ id: mlTrainingRuns.id });

      try {
        await triggerMlJob("/internal/training-runs", { training_run_id: inserted.id });
      } catch (e) {
        await db
          .update(mlTrainingRuns)
          .set({ status: "failed", errorMessage: (e as Error).message })
          .where(eq(mlTrainingRuns.id, inserted.id));
      }

      const run = await fetchTrainingRun(inserted.id);
      return mapTrainingRun(run!);
    },
    {
      body: t.Object({
        train_source_id: t.String(),
        cutoff_date: t.String(),
        horizon_days: t.Optional(t.Number()),
        // sent by the web client; dataset_name is derived from the source server-side
        dataset_name: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/:id",
    async ({ params, set }) => {
      const run = await fetchTrainingRun(params.id);
      if (!run) {
        set.status = 404;
        return { message: "Training run not found" };
      }
      return mapTrainingRun(run);
    },
    { params: t.Object({ id: t.String() }) }
  );
