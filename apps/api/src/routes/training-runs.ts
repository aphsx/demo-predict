/**
 * [NEW] ML v2 training runs API — docs/ML-V2-DASHBOARD-SPEC.md §2.6/§7.
 * Response contract mirrors apps/web/src/lib/mlApi.ts (snake_case keys).
 */
import Elysia, { t } from "elysia";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { mlTrainingRuns, trainDataSources, user } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { denyNotFound, requireOwnedForRead } from "../lib/access-control";
import { triggerMlJob } from "../lib/ml-internal";
import { getTrainCutoffSuggestion } from "../lib/clean-cutoff";
import {
  type RunStatus,
  type TrainingRun,
  type TrainingRunResult,
} from "../lib/ml-contract";
import { DATE_RE, UUID_RE } from "../lib/constants";
const DEFAULT_HORIZON_DAYS = 180;
const ACTIVE_WINDOW_DAYS = 180;

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
  .get("/", async ({ userId }) => {
    const rows = await db
      .select(runSelect)
      .from(mlTrainingRuns)
      .leftJoin(trainDataSources, eq(mlTrainingRuns.sourceId, trainDataSources.id))
      .leftJoin(user, eq(mlTrainingRuns.createdBy, user.id))
      .where(eq(mlTrainingRuns.createdBy, userId!))
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
      if (body.cutoff_date !== undefined && !DATE_RE.test(body.cutoff_date)) {
        set.status = 400;
        return { message: "cutoff_date must be YYYY-MM-DD" };
      }
      const [source] = await db
        .select({ id: trainDataSources.id, importStatus: trainDataSources.importStatus })
        .from(trainDataSources)
        .where(and(eq(trainDataSources.id, body.train_source_id), eq(trainDataSources.importedBy, userId!)))
        .limit(1);
      if (!source) return denyNotFound(set, "Train data source not found");
      if (source.importStatus !== "ready") {
        set.status = 400;
        return { message: "Train data source must be ready before training" };
      }
      const horizonDays = body.horizon_days ?? DEFAULT_HORIZON_DAYS;
      if (horizonDays <= 0) {
        set.status = 400;
        return { message: "horizon_days must be positive" };
      }
      // Month-aligned: usage data is monthly, so a mid-month cutoff makes the
      // credit 30d label window catch usage periods inconsistently.
      const suggested = await getTrainCutoffSuggestion(body.train_source_id, horizonDays);
      const cutoffDate = body.cutoff_date ?? suggested.cutoff_date;
      if (!cutoffDate) {
        set.status = 400;
        return { message: "No clean activity data for this source yet" };
      }
      if (!cutoffDate.endsWith("-01")) {
        set.status = 400;
        return {
          message:
            "cutoff_date must be the first day of a month — usage data is monthly, so a mid-month cutoff leaks post-cutoff usage into features. Use the suggested cutoff.",
          suggested_cutoff: suggested?.cutoff_date ?? null,
        };
      }

      const [cutoffCheck] = await db.execute<{
        min_activity_date: string | null;
        max_activity_date: string | null;
        required_history_before: string;
        required_label_through: string;
        history_ok: boolean | null;
        label_ok: boolean | null;
      }>(sql`
        WITH activity AS (
          SELECT MIN(activity_date)::date AS min_activity,
                 MAX(activity_date)::date AS max_activity
          FROM (
            SELECT payment_date::date AS activity_date
            FROM train_clean_payments
            WHERE source_id = ${body.train_source_id} AND payment_date IS NOT NULL
            UNION ALL
            SELECT make_date(year, month, 1)::date AS activity_date
            FROM train_clean_usage
            WHERE source_id = ${body.train_source_id}
              AND year IS NOT NULL
              AND month IS NOT NULL
          ) a
        )
        SELECT
          to_char(min_activity, 'YYYY-MM-DD') AS min_activity_date,
          to_char(max_activity, 'YYYY-MM-DD') AS max_activity_date,
          to_char(${cutoffDate}::date - ${ACTIVE_WINDOW_DAYS}::int, 'YYYY-MM-DD') AS required_history_before,
          to_char(${cutoffDate}::date + ${horizonDays}::int, 'YYYY-MM-DD') AS required_label_through,
          min_activity < (${cutoffDate}::date - ${ACTIVE_WINDOW_DAYS}::int) AS history_ok,
          max_activity >= (${cutoffDate}::date + ${horizonDays}::int) AS label_ok
        FROM activity
      `);
      if (!cutoffCheck?.history_ok || !cutoffCheck.label_ok) {
        set.status = 400;
        return {
          message:
            "cutoff_date does not satisfy training Gate 3. Use the suggested cutoff for this source.",
          details: cutoffCheck ?? null,
        };
      }

      const [inserted] = await db
        .insert(mlTrainingRuns)
        .values({
          sourceId: body.train_source_id,
          cutoffDate,
          horizonDays,
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
        cutoff_date: t.Optional(t.String()),
        horizon_days: t.Optional(t.Number()),
        // sent by the web client; dataset_name is derived from the source server-side
        dataset_name: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/:id",
    async ({ params, userId, set }) => {
      const run = await fetchTrainingRun(params.id);
      const denied = requireOwnedForRead(run, run?.createdBy, userId, set, "Training run not found");
      if (denied) return denied;
      return mapTrainingRun(run!);
    },
    { params: t.Object({ id: t.String() }) }
  );
