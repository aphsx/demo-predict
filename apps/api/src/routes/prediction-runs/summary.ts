import Elysia, { t } from "elysia";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { mlModelAliases, mlModelVersions, mlPredictionOutputs, mlPredictionRuns, predictDataSources, user } from "../../db/schema";
import { requireUser } from "../../lib/auth-middleware";
import { denyNotFound } from "../../lib/access-control";
import { UUID_RE } from "../../lib/constants";
import {
  DEFAULT_RISK_THRESHOLDS,
  EMPTY_MODEL_VERSIONS,
  monthKeysBeforeCutoff,
  num,
  TOP_PRIORITY_LIMIT,
  type LifecycleStage,
  type RunStatus,
  type RunSummary,
  type ValueTier,
} from "../../lib/ml-contract";
import { fetchRunAggregates } from "../../lib/run-aggregates";
import { runSelect, type RunRow } from "./_helpers";

async function churnThresholds(): Promise<{ medium: number; high: number; critical: number }> {
  const rows = await db
    .select({ modelCardJson: mlModelVersions.modelCardJson })
    .from(mlModelAliases)
    .innerJoin(mlModelVersions, eq(mlModelAliases.modelVersionId, mlModelVersions.id))
    .where(and(eq(mlModelAliases.alias, "production"), eq(mlModelAliases.modelType, "churn")))
    .limit(1);
  const card = rows[0]?.modelCardJson as {
    thresholds?: { medium?: number; high?: number; critical?: number };
  } | null;
  return {
    medium: card?.thresholds?.medium ?? DEFAULT_RISK_THRESHOLDS.medium,
    high: card?.thresholds?.high ?? DEFAULT_RISK_THRESHOLDS.high,
    critical: card?.thresholds?.critical ?? DEFAULT_RISK_THRESHOLDS.critical,
  };
}

async function monthlyActual(
  predictSourceId: string,
  cutoffDate: string
): Promise<RunSummary["revenue"]["monthly_actual"]> {
  const rows = await db.execute<{ month: string; amount: number; n_payments: number }>(sql`
    SELECT to_char(date_trunc('month', payment_date), 'YYYY-MM') AS month,
           COALESCE(SUM(amount), 0)::float8 AS amount,
           COUNT(*)::int AS n_payments
    FROM predict_clean_payments
    WHERE source_id = ${predictSourceId}
      AND payment_date >= date_trunc('month', ${cutoffDate}::date) - INTERVAL '12 months'
      AND payment_date < date_trunc('month', ${cutoffDate}::date)
    GROUP BY 1
  `);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return monthKeysBeforeCutoff(cutoffDate).map((month) => ({
    month,
    amount: byMonth.get(month)?.amount ?? 0,
    n_payments: byMonth.get(month)?.n_payments ?? 0,
  }));
}

async function buildSummary(run: RunRow & { modelVersionsJson: unknown }): Promise<RunSummary> {
  const o = mlPredictionOutputs;
  const inRun = eq(o.predictionRunId, run.id);

  const [agg, topRows, monthly, thresholds] = await Promise.all([
    fetchRunAggregates(run.id),
    db
      .select({
        accId: o.accId,
        lifecycleStage: o.lifecycleStage,
        churnProbability: o.churnProbability,
        predictedClv6m: o.predictedClv6m,
        priorityScore: o.priorityScore,
      })
      .from(o)
      .where(inRun)
      .orderBy(sql`${o.priorityScore} DESC NULLS LAST`, asc(o.accId))
      .limit(TOP_PRIORITY_LIMIT),
    monthlyActual(run.predictSourceId, run.cutoffDate),
    churnThresholds(),
  ]);

  return {
    run: {
      id: run.id,
      name: run.name,
      cutoff_date: run.cutoffDate,
      status: run.status as RunStatus,
      total_customers: agg.total_customers,
      finished_at: run.finishedAt?.toISOString() ?? null,
    },
    lifecycle: agg.lifecycle,
    churn: { eligible_count: agg.churn_eligible, by_risk: agg.churn_by_risk, thresholds },
    revenue: {
      expected_at_risk: agg.revenue_expected_at_risk,
      high_risk_exposure: agg.revenue_high_risk_exposure,
      monthly_actual: monthly,
    },
    value_risk_matrix: agg.value_risk_matrix.map((row) => ({
      value_tier: row.value_tier as ValueTier,
      risk_level: row.risk_level,
      count: row.count,
      clv_sum: row.clv_sum,
    })),
    credit: {
      demand_30d: agg.credit_demand_30d,
      by_urgency: agg.credit_by_urgency,
      topup_due_7d: agg.credit_topup_due_7d,
    },
    top_priority: topRows.map((row) => ({
      acc_id: row.accId,
      lifecycle_stage: (row.lifecycleStage ?? "Ghost") as LifecycleStage,
      churn_probability: num(row.churnProbability),
      predicted_clv_6m: num(row.predictedClv6m),
      priority_score: num(row.priorityScore) ?? 0,
    })),
    model_versions:
      (run.modelVersionsJson as RunSummary["model_versions"] | null) ?? EMPTY_MODEL_VERSIONS,
  };
}

export const summaryRoutes = new Elysia()
  .use(requireUser)
  .get(
    "/:id/summary",
    async ({ params, set }) => {
      if (!UUID_RE.test(params.id)) return denyNotFound(set, "Prediction run not found");
      const [row] = await db
        .select({
          ...runSelect,
          modelVersionsJson: mlPredictionRuns.modelVersionsJson,
        })
        .from(mlPredictionRuns)
        .leftJoin(predictDataSources, eq(mlPredictionRuns.predictSourceId, predictDataSources.id))
        .leftJoin(user, eq(mlPredictionRuns.createdBy, user.id))
        .where(eq(mlPredictionRuns.id, params.id))
        .limit(1);
      if (!row) return denyNotFound(set, "Prediction run not found");
      return buildSummary(row);
    },
    { params: t.Object({ id: t.String() }) }
  );
