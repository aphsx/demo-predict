/**
 * Cutoff-date suggestions derived from a source's clean activity tables.
 *
 * The "latest observed activity" core — GREATEST of the last payment date and
 * the last usage month — was duplicated across train-data, predict-data and
 * training-runs. It lives here once, with one transform per scope:
 *   - train:   month-aligned (latest_activity − horizon), the latest fully
 *              observed label cutoff.
 *   - predict: the day after the latest observed activity.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client";

export type CutoffSuggestion = {
  /** Suggested cutoff in YYYY-MM-DD, or null when the source has no clean activity. */
  cutoff_date: string | null;
  /** Latest observed activity date in YYYY-MM-DD, or null. */
  latest_data_date: string | null;
};

const EMPTY: CutoffSuggestion = { cutoff_date: null, latest_data_date: null };

/** Suggested training cutoff: month-aligned `latest_activity - horizonDays`. */
export async function getTrainCutoffSuggestion(
  sourceId: string,
  horizonDays: number
): Promise<CutoffSuggestion> {
  const [row] = await db.execute<CutoffSuggestion>(sql`
    SELECT to_char(date_trunc('month', (latest - ${horizonDays}::int)::timestamp)::date, 'YYYY-MM-DD') AS cutoff_date,
           to_char(latest, 'YYYY-MM-DD') AS latest_data_date
    FROM (
      SELECT GREATEST(
        (SELECT MAX(payment_date)::date
         FROM train_clean_payments WHERE source_id = ${sourceId}),
        (SELECT MAX(make_date(year, month, 1))
         FROM train_clean_usage
         WHERE source_id = ${sourceId} AND year IS NOT NULL AND month IS NOT NULL)
      ) AS latest
    ) s
  `);
  return row ?? EMPTY;
}

/** Suggested prediction cutoff: the day after the latest observed activity. */
export async function getPredictCutoffSuggestion(
  sourceId: string
): Promise<CutoffSuggestion> {
  const [row] = await db.execute<CutoffSuggestion>(sql`
    SELECT to_char(latest + 1, 'YYYY-MM-DD') AS cutoff_date,
           to_char(latest, 'YYYY-MM-DD') AS latest_data_date
    FROM (
      SELECT GREATEST(
        (SELECT MAX(payment_date)::date
         FROM predict_clean_payments WHERE source_id = ${sourceId}),
        (SELECT MAX(make_date(year, month, 1))
         FROM predict_clean_usage
         WHERE source_id = ${sourceId} AND year IS NOT NULL AND month IS NOT NULL)
      ) AS latest
    ) s
  `);
  return row ?? EMPTY;
}
