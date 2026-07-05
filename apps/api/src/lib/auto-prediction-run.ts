/**
 * Auto prediction run after a successful predict import.
 *
 * When a predict data source finishes importing (raw + clean), we immediately
 * create and trigger a prediction run for it using the suggested cutoff, so
 * the dashboard has fresh predictions without a manual step. Attributed to the
 * importing user and follows the normal status lifecycle.
 *
 * This must NEVER fail the import: any error is contained here — if a run row
 * was already inserted it is marked 'failed' with error_message; otherwise the
 * auto-run is simply skipped with a log line.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { mlPredictionRuns } from "../db/schema";
import { getPredictCutoffSuggestion } from "./clean-cutoff";
import { triggerMlJob } from "./ml-internal";
import { RUN_STATUS } from "./constants";

/** Prefix for auto-created run names: "Auto — {source} {YYYY-MM-DD}". */
export const AUTO_RUN_NAME_PREFIX = "Auto";

export interface AutoPredictionRunOptions {
  predictSourceId: string;
  /** Display name of the source (falls back to the uploaded filename upstream). */
  sourceName: string;
  /** The importing user — the auto run is attributed to them. */
  createdBy: string;
}

/**
 * Create + trigger the auto prediction run. Returns the new run id, or null
 * when no run could be created (e.g. no clean activity data yet). Never throws.
 */
export async function createAutoPredictionRun(
  opts: AutoPredictionRunOptions
): Promise<string | null> {
  let runId: string | null = null;
  try {
    const suggested = await getPredictCutoffSuggestion(opts.predictSourceId);
    if (!suggested.cutoff_date) {
      console.warn(
        `[auto-run] Source ${opts.predictSourceId} has no clean activity data — skipping auto prediction run`
      );
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);
    const [inserted] = await db
      .insert(mlPredictionRuns)
      .values({
        predictSourceId: opts.predictSourceId,
        name: `${AUTO_RUN_NAME_PREFIX} — ${opts.sourceName} ${today}`,
        cutoffDate: suggested.cutoff_date,
        status: RUN_STATUS.PENDING,
        createdBy: opts.createdBy,
      })
      .returning({ id: mlPredictionRuns.id });
    runId = inserted.id;

    await triggerMlJob("/internal/prediction-runs", { prediction_run_id: runId });
    return runId;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Auto prediction run failed";
    console.error(`[auto-run] Source ${opts.predictSourceId}: ${message}`);
    if (runId) {
      try {
        await db
          .update(mlPredictionRuns)
          .set({ status: RUN_STATUS.FAILED, errorMessage: message })
          .where(eq(mlPredictionRuns.id, runId));
      } catch (updateError) {
        console.error(`[auto-run] Failed to mark run ${runId} failed:`, updateError);
      }
    }
    return runId;
  }
}
