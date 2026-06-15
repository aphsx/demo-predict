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
  type RiskLevel,
  type RunStatus,
  type RunSummary,
  type UrgencyLevel,
  type ValueTier,
} from "../../lib/ml-contract";
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

  const [
    lifecycleRows,
    [scalarAgg],
    riskRows,
    urgencyRows,
    matrixRows,
    topRows,
    monthly,
    thresholds,
  ] = await Promise.all([
    db
      .select({ stage: o.lifecycleStage, n: sql<number>`COUNT(*)::int` })
      .from(o)
      .where(inRun)
      .groupBy(o.lifecycleStage),
    db
      .select({
        eligibleCount: sql<number>`COUNT(*) FILTER (WHERE ${o.churnProbability} IS NOT NULL)::int`,
        expectedAtRisk: sql<number>`COALESCE(SUM(${o.revenueAtRisk}) FILTER (WHERE ${o.lifecycleStage} = 'Active Paid'), 0)::float8`,
        highRiskExposure: sql<number>`COALESCE(SUM(${o.predictedClv6m}) FILTER (WHERE ${o.churnRiskLevel} IN ('high', 'critical')), 0)::float8`,
        demand30d: sql<number>`COALESCE(SUM(${o.predictedCreditUsage30d}) FILTER (WHERE ${o.lifecycleStage} LIKE 'Active%'), 0)::float8`,
        topupDue7d: sql<number>`COUNT(*) FILTER (WHERE ${o.estimatedDaysUntilTopup} <= 7)::int`,
      })
      .from(o)
      .where(inRun),
    db
      .select({ level: o.churnRiskLevel, n: sql<number>`COUNT(*)::int` })
      .from(o)
      .where(and(inRun, sql`${o.churnRiskLevel} IS NOT NULL`))
      .groupBy(o.churnRiskLevel),
    db
      .select({ level: o.creditUrgencyLevel, n: sql<number>`COUNT(*)::int` })
      .from(o)
      .where(and(inRun, sql`${o.creditUrgencyLevel} IS NOT NULL`))
      .groupBy(o.creditUrgencyLevel),
    db
      .select({
        tier: o.customerValueTier,
        level: o.churnRiskLevel,
        n: sql<number>`COUNT(*)::int`,
        clvSum: sql<number>`COALESCE(SUM(${o.predictedClv6m}), 0)::float8`,
      })
      .from(o)
      .where(
        and(inRun, sql`${o.customerValueTier} IS NOT NULL`, sql`${o.churnRiskLevel} IS NOT NULL`)
      )
      .groupBy(o.customerValueTier, o.churnRiskLevel),
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

  const lifecycle = { active_paid: 0, active_free: 0, churned: 0, ghost: 0 };
  for (const row of lifecycleRows) {
    if (row.stage === "Active Paid") lifecycle.active_paid = row.n;
    else if (row.stage === "Active Free") lifecycle.active_free = row.n;
    else if (row.stage === "Churned") lifecycle.churned = row.n;
    else if (row.stage === "Ghost") lifecycle.ghost = row.n;
  }

  const byRisk: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const row of riskRows) {
    if (row.level && row.level in byRisk) byRisk[row.level as RiskLevel] = row.n;
  }

  const byUrgency: Record<UrgencyLevel, number> = {
    critical: 0,
    warning: 0,
    monitor: 0,
    stable: 0,
  };
  for (const row of urgencyRows) {
    if (row.level && row.level in byUrgency) byUrgency[row.level as UrgencyLevel] = row.n;
  }

  return {
    run: {
      id: run.id,
      name: run.name,
      cutoff_date: run.cutoffDate,
      status: run.status as RunStatus,
      total_customers: run.totalCustomers ?? 0,
      finished_at: run.finishedAt?.toISOString() ?? null,
    },
    lifecycle,
    churn: { eligible_count: scalarAgg.eligibleCount, by_risk: byRisk, thresholds },
    revenue: {
      expected_at_risk: scalarAgg.expectedAtRisk,
      high_risk_exposure: scalarAgg.highRiskExposure,
      monthly_actual: monthly,
    },
    value_risk_matrix: matrixRows.map((row) => ({
      value_tier: row.tier as ValueTier,
      risk_level: row.level as RiskLevel,
      count: row.n,
      clv_sum: row.clvSum,
    })),
    credit: {
      demand_30d: scalarAgg.demand30d,
      by_urgency: byUrgency,
      topup_due_7d: scalarAgg.topupDue7d,
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
    async ({ params, userId, set }) => {
      if (!UUID_RE.test(params.id)) return denyNotFound(set, "Prediction run not found");
      const [row] = await db
        .select({
          ...runSelect,
          modelVersionsJson: mlPredictionRuns.modelVersionsJson,
        })
        .from(mlPredictionRuns)
        .leftJoin(predictDataSources, eq(mlPredictionRuns.predictSourceId, predictDataSources.id))
        .leftJoin(user, eq(mlPredictionRuns.createdBy, user.id))
        .where(and(eq(mlPredictionRuns.id, params.id), eq(mlPredictionRuns.createdBy, userId!)))
        .limit(1);
      if (!row) return denyNotFound(set, "Prediction run not found");
      return buildSummary(row);
    },
    { params: t.Object({ id: t.String() }) }
  );
