/**
 * Row-scope enforcement for AI Text-to-SQL.
 *
 * The SQL guard (sql-guard.ts) proves a query is a safe, read-only SELECT over
 * modeled tables. This module proves the query only touches data that exists in
 * the org (all runs/sources are shared org-wide), and — for run-bound
 * conversations — only the bound run.
 *
 * Access model: the platform is org-shared. Every authenticated user may read
 * every prediction run and data source, so the scope here is "all known ids"
 * rather than per-user ownership. The deterministic checks still matter:
 *
 *   - Run-scoped tables (ml_prediction_runs / ml_prediction_outputs) and
 *     source-scoped tables (predict_clean_*) must carry an explicit id filter,
 *     so queries stay anchored to concrete runs instead of scanning everything.
 *   - Every UUID literal in the query must be a known run/source id. An unknown
 *     id ⇒ reject (with feedback so the agent can retry).
 *   - A run-bound conversation must reference its own run id.
 *
 * The check is intentionally conservative: when in doubt it rejects and lets the
 * self-correcting agent regenerate, rather than letting a query through.
 */

import { eq } from "drizzle-orm";

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
  /** All prediction run ids in the org (shared visibility). */
  runIds: string[];
  /** All predict data source ids in the org (shared visibility). */
  sourceIds: string[];
};

export type ScopeCheck =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Load the ids the current user is allowed to query, in one round-trip each.
 * Org-shared model: every authenticated user may query every run/source, so
 * this returns all known ids. `_userId` is kept for call-site compatibility
 * and future per-team scoping.
 */
export async function loadUserScope(_userId: string): Promise<UserScope> {
  const [{ db }, { mlPredictionRuns, predictDataSources }] = await Promise.all([
    import("../../db/client"),
    import("../../db/schema"),
  ]);

  const [runs, sources] = await Promise.all([
    db.select({ id: mlPredictionRuns.id }).from(mlPredictionRuns),
    db.select({ id: predictDataSources.id }).from(predictDataSources),
  ]);
  return { runIds: runs.map((r) => r.id), sourceIds: sources.map((s) => s.id) };
}

/** Resolve a run's source id. Org-shared: any existing run resolves. */
export async function loadRunSourceId(runId: string): Promise<string | null> {
  const [{ db }, { mlPredictionRuns }] = await Promise.all([
    import("../../db/client"),
    import("../../db/schema"),
  ]);

  const [row] = await db
    .select({ sourceId: mlPredictionRuns.predictSourceId })
    .from(mlPredictionRuns)
    .where(eq(mlPredictionRuns.id, runId))
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
