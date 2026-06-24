/**
 * Shared population-level aggregates for a prediction run.
 *
 * Both the summary route and the run-insight AI service need the same
 * counts and distributions. Keeping one implementation here prevents the
 * two consumers from drifting independently.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { mlPredictionOutputs } from "../db/schema";
import type { RiskLevel, UrgencyLevel, ValueTier } from "./ml-contract";

export type RunAggregates = {
  total_customers: number;
  churn_eligible: number;
  lifecycle: { active_paid: number; active_free: number; churned: number; ghost: number };
  churn_by_risk: Record<RiskLevel, number>;
  usage_trend: { increasing: number; stable: number; declining: number; no_usage: number };
  credit_by_urgency: Record<UrgencyLevel, number>;
  revenue_expected_at_risk: number;
  revenue_high_risk_exposure: number;
  credit_demand_30d: number;
  credit_topup_due_7d: number;
  value_risk_matrix: {
    value_tier: ValueTier;
    risk_level: RiskLevel;
    count: number;
    clv_sum: number;
    revenue_at_risk: number;
  }[];
};

export async function fetchRunAggregates(runId: string): Promise<RunAggregates> {
  const o = mlPredictionOutputs;
  const inRun = eq(o.predictionRunId, runId);

  const [lifecycleRows, riskRows, trendRows, urgencyRows, [scalars], matrixRows] =
    await Promise.all([
      db
        .select({ stage: o.lifecycleStage, n: sql<number>`COUNT(*)::int` })
        .from(o)
        .where(inRun)
        .groupBy(o.lifecycleStage),
      db
        .select({ level: o.churnRiskLevel, n: sql<number>`COUNT(*)::int` })
        .from(o)
        .where(and(inRun, sql`${o.churnRiskLevel} IS NOT NULL`))
        .groupBy(o.churnRiskLevel),
      db
        .select({ trend: o.usageTrend, n: sql<number>`COUNT(*)::int` })
        .from(o)
        .where(and(inRun, sql`${o.usageTrend} IS NOT NULL`))
        .groupBy(o.usageTrend),
      db
        .select({ level: o.creditUrgencyLevel, n: sql<number>`COUNT(*)::int` })
        .from(o)
        .where(and(inRun, sql`${o.creditUrgencyLevel} IS NOT NULL`))
        .groupBy(o.creditUrgencyLevel),
      db
        .select({
          total: sql<number>`COUNT(*)::int`,
          eligibleCount: sql<number>`COUNT(*) FILTER (WHERE ${o.churnProbability} IS NOT NULL)::int`,
          expectedAtRisk: sql<number>`COALESCE(SUM(${o.revenueAtRisk}) FILTER (WHERE ${o.lifecycleStage} = 'Active Paid'), 0)::float8`,
          highRiskExposure: sql<number>`COALESCE(SUM(${o.predictedClv6m}) FILTER (WHERE ${o.churnRiskLevel} IN ('high', 'critical')), 0)::float8`,
          demand30d: sql<number>`COALESCE(SUM(${o.predictedCreditUsage30d}) FILTER (WHERE ${o.lifecycleStage} LIKE 'Active%'), 0)::float8`,
          topupDue7d: sql<number>`COUNT(*) FILTER (WHERE ${o.estimatedDaysUntilTopup} <= 7)::int`,
        })
        .from(o)
        .where(inRun),
      db
        .select({
          tier: o.customerValueTier,
          level: o.churnRiskLevel,
          n: sql<number>`COUNT(*)::int`,
          clvSum: sql<number>`COALESCE(SUM(${o.predictedClv6m}), 0)::float8`,
          revAtRisk: sql<number>`COALESCE(SUM(${o.revenueAtRisk}), 0)::float8`,
        })
        .from(o)
        .where(
          and(
            inRun,
            sql`${o.customerValueTier} IS NOT NULL`,
            sql`${o.churnRiskLevel} IS NOT NULL`
          )
        )
        .groupBy(o.customerValueTier, o.churnRiskLevel),
    ]);

  const lifecycle = { active_paid: 0, active_free: 0, churned: 0, ghost: 0 };
  for (const row of lifecycleRows) {
    if (row.stage === "Active Paid") lifecycle.active_paid = row.n;
    else if (row.stage === "Active Free") lifecycle.active_free = row.n;
    else if (row.stage === "Churned") lifecycle.churned = row.n;
    else if (row.stage === "Ghost") lifecycle.ghost = row.n;
  }

  const churnByRisk: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const row of riskRows) {
    if (row.level && row.level in churnByRisk) churnByRisk[row.level as RiskLevel] = row.n;
  }

  const usageTrend = { increasing: 0, stable: 0, declining: 0, no_usage: 0 };
  for (const row of trendRows) {
    if (row.trend && row.trend in usageTrend) usageTrend[row.trend as keyof typeof usageTrend] = row.n;
  }

  const creditByUrgency: Record<UrgencyLevel, number> = {
    critical: 0,
    warning: 0,
    monitor: 0,
    stable: 0,
  };
  for (const row of urgencyRows) {
    if (row.level && row.level in creditByUrgency)
      creditByUrgency[row.level as UrgencyLevel] = row.n;
  }

  return {
    total_customers: scalars.total,
    churn_eligible: scalars.eligibleCount,
    lifecycle,
    churn_by_risk: churnByRisk,
    usage_trend: usageTrend,
    credit_by_urgency: creditByUrgency,
    revenue_expected_at_risk: scalars.expectedAtRisk,
    revenue_high_risk_exposure: scalars.highRiskExposure,
    credit_demand_30d: Math.round(scalars.demand30d),
    credit_topup_due_7d: scalars.topupDue7d,
    value_risk_matrix: matrixRows
      .filter((r) => r.n > 0)
      .map((r) => ({
        value_tier: r.tier as ValueTier,
        risk_level: r.level as RiskLevel,
        count: r.n,
        clv_sum: r.clvSum,
        revenue_at_risk: r.revAtRisk,
      })),
  };
}
