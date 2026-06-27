/**
 * Row-scope enforcement for AI Text-to-SQL.
 *
 * The SQL guard (sql-guard.ts) proves a query is a safe, read-only SELECT over
 * modeled tables. This module proves the query only touches data the *current
 * user* is allowed to see, and — for run-bound conversations — only the bound
 * run.
 *
 * Previously this was prompt-trusted: the planner was *told* the user's run ids
 * and asked nicely to filter by them. A model mistake or prompt-injection could
 * read another user's predictions. Here we enforce it deterministically:
 *
 *   - Run-scoped tables (ml_prediction_runs / ml_prediction_outputs) and
 *     source-scoped tables (predict_clean_*) must carry an explicit id filter.
 *   - Every UUID literal in the query must belong to the user's own run ids or
 *     source ids. A foreign id ⇒ reject (with feedback so the agent can retry).
 *   - A run-bound conversation must reference its own run id.
 *
 * The check is intentionally conservative: when in doubt it rejects and lets the
 * self-correcting agent regenerate, rather than letting a query through.
 */

import { and, eq } from "drizzle-orm";

const UUID_LITERAL_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Tables whose rows are partitioned by prediction run. */
const RUN_SCOPED_TABLES = ["ml_prediction_runs", "ml_prediction_outputs"];
/** Tables whose rows are partitioned by predict data source. */
const SOURCE_SCOPED_TABLES = [
  "predict_clean_customers",
  "predict_clean_payments",
  "predict_clean_usage",
  "predict_data_sources",
];

export type UserScope = {
  /** Prediction run ids owned by the user. */
  runIds: string[];
  /** Predict data source ids owned by the user. */
  sourceIds: string[];
};

export type ScopeCheck =
  | { ok: true }
  | { ok: false; reason: string };

/** Load the ids the current user is allowed to query, in one round-trip each. */
export async function loadUserScope(userId: string): Promise<UserScope> {
  const [{ db }, { mlPredictionRuns, predictDataSources }] = await Promise.all([
    import("../../db/client"),
    import("../../db/schema"),
  ]);

  const [runs, sources] = await Promise.all([
    db
      .select({ id: mlPredictionRuns.id })
      .from(mlPredictionRuns)
      .where(eq(mlPredictionRuns.createdBy, userId)),
    db
      .select({ id: predictDataSources.id })
      .from(predictDataSources)
      .where(eq(predictDataSources.importedBy, userId)),
  ]);
  return { runIds: runs.map((r) => r.id), sourceIds: sources.map((s) => s.id) };
}

/** True when the user owns a run and we can resolve its source id. */
export async function loadRunSourceId(
  runId: string,
  userId: string
): Promise<string | null> {
  const [{ db }, { mlPredictionRuns }] = await Promise.all([
    import("../../db/client"),
    import("../../db/schema"),
  ]);

  const [row] = await db
    .select({ sourceId: mlPredictionRuns.predictSourceId })
    .from(mlPredictionRuns)
    .where(and(eq(mlPredictionRuns.id, runId), eq(mlPredictionRuns.createdBy, userId)))
    .limit(1);
  return row?.sourceId ?? null;
}

function referencesAny(sqlLower: string, tables: string[]): boolean {
  return tables.some((t) => new RegExp(`\\b${t}\\b`, "i").test(sqlLower));
}

function uuidsIn(sql: string): string[] {
  return (sql.match(UUID_LITERAL_RE) ?? []).map((u) => u.toLowerCase());
}

/**
 * Enforce that `sql` only reads the user's own rows (and, when set, only the
 * bound run). Returns a feedback `reason` on rejection so the agent can retry.
 */
export function enforceScope(
  sql: string,
  scope: UserScope,
  boundRunId: string | null
): ScopeCheck {
  const lower = sql.toLowerCase();
  const touchesRun = referencesAny(lower, RUN_SCOPED_TABLES);
  const touchesSource = referencesAny(lower, SOURCE_SCOPED_TABLES);
  if (!touchesRun && !touchesSource) return { ok: true };

  const allowedRuns = new Set(scope.runIds.map((id) => id.toLowerCase()));
  const allowedSources = new Set(scope.sourceIds.map((id) => id.toLowerCase()));
  const present = uuidsIn(lower);

  // No foreign ids: every UUID literal must be one of the user's own ids.
  for (const id of present) {
    if (!allowedRuns.has(id) && !allowedSources.has(id)) {
      return {
        ok: false,
        reason:
          "Query references an id that does not belong to this user. " +
          "Only filter by the user's own run/source ids.",
      };
    }
  }

  const presentSet = new Set(present);

  if (touchesRun) {
    const hasOwnRun = [...allowedRuns].some((id) => presentSet.has(id));
    if (!hasOwnRun) {
      return {
        ok: false,
        reason:
          "Queries on ml_prediction_runs / ml_prediction_outputs must filter by " +
          "the user's own prediction run id (e.g. prediction_run_id IN (...)).",
      };
    }
    if (boundRunId && !presentSet.has(boundRunId.toLowerCase())) {
      return {
        ok: false,
        reason: `This conversation is scoped to run ${boundRunId}. ` +
          `Filter ml_prediction_* strictly by that run id.`,
      };
    }
  }

  if (touchesSource) {
    const hasOwnSource = [...allowedSources].some((id) => presentSet.has(id));
    if (!hasOwnSource) {
      return {
        ok: false,
        reason:
          "Queries on predict_clean_* / predict_data_sources must filter by the " +
          "user's own source id (source_id = '...').",
      };
    }
  }

  return { ok: true };
}
