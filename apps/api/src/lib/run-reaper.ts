/**
 * Stale-run reaper.
 *
 * The ML runners normally end every run in 'completed'/'failed', but a killed
 * container or dropped connection can strand rows in a non-terminal status
 * forever. On API startup and every STALE_RUN_REAPER_INTERVAL_MS, mark any
 * ml_prediction_runs / ml_training_runs row that has been non-terminal for
 * longer than STALE_RUN_TIMEOUT_MINUTES (env, default 120) as 'failed'.
 */
import { and, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { mlPredictionRuns, mlTrainingRuns } from "../db/schema";
import { RUN_STATUS } from "./constants";

export const STALE_RUN_REAPER_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_STALE_RUN_TIMEOUT_MINUTES = 120;
export const STALE_RUN_ERROR_MESSAGE = "timed out — marked failed by reaper";

/** Statuses a healthy run must eventually leave. */
const NON_TERMINAL_STATUSES: string[] = [RUN_STATUS.PENDING, RUN_STATUS.IN_PROGRESS];

function staleRunTimeoutMinutes(): number {
  const parsed = Number(process.env.STALE_RUN_TIMEOUT_MINUTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STALE_RUN_TIMEOUT_MINUTES;
}

/** Mark stale non-terminal runs failed. Returns how many rows each table lost. */
export async function reapStaleRuns(): Promise<{ prediction: number; training: number }> {
  const minutes = staleRunTimeoutMinutes();
  const now = new Date();

  const [prediction, training] = await Promise.all([
    db
      .update(mlPredictionRuns)
      .set({ status: RUN_STATUS.FAILED, errorMessage: STALE_RUN_ERROR_MESSAGE, finishedAt: now })
      .where(
        and(
          inArray(mlPredictionRuns.status, NON_TERMINAL_STATUSES),
          sql`COALESCE(${mlPredictionRuns.startedAt}, ${mlPredictionRuns.createdAt}) < NOW() - make_interval(mins => ${minutes})`
        )
      )
      .returning({ id: mlPredictionRuns.id }),
    db
      .update(mlTrainingRuns)
      .set({ status: RUN_STATUS.FAILED, errorMessage: STALE_RUN_ERROR_MESSAGE, finishedAt: now })
      .where(
        and(
          inArray(mlTrainingRuns.status, NON_TERMINAL_STATUSES),
          sql`COALESCE(${mlTrainingRuns.startedAt}, ${mlTrainingRuns.createdAt}) < NOW() - make_interval(mins => ${minutes})`
        )
      )
      .returning({ id: mlTrainingRuns.id }),
  ]);

  return { prediction: prediction.length, training: training.length };
}

/**
 * Run the reaper once now, then on an interval. The timer is unref'd so it
 * never keeps the process alive during shutdown.
 */
export function startStaleRunReaper(): void {
  const tick = (): void => {
    reapStaleRuns()
      .then(({ prediction, training }) => {
        if (prediction > 0 || training > 0) {
          console.log(
            `[reaper] Marked stale runs failed: prediction=${prediction} training=${training}`
          );
        }
      })
      .catch((e: unknown) => console.error("[reaper] Failed to reap stale runs:", e));
  };
  tick();
  const timer = setInterval(tick, STALE_RUN_REAPER_INTERVAL_MS);
  timer.unref?.();
}
