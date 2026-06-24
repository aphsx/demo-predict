/**
 * Run-insight context.
 *
 * Aggregates the deterministic, population-level signals of one prediction run
 * straight from ml_prediction_outputs (SQL only — no model calls). These numbers
 * are what the base-summary LLM verbalizes, and the same shape the dashboard's
 * cohort grid renders, so the narrative is always grounded in figures the user
 * can see for themselves.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { mlPredictionOutputs } from "../../db/schema";
import type { RiskLevel, UrgencyLevel, ValueTier } from "../ml-contract";

export type RunInsightCohort = {
  value_tier: ValueTier;
  risk_level: RiskLevel;
  count: number;
  clv_sum: number;
  revenue_at_risk: number;
};

export type RunInsightSignals = {
  total_customers: number;
  lifecycle: { active_paid: number; active_free: number; churned: number; ghost: number };
  churn: { eligible: number; by_risk: Record<RiskLevel, number>; high_plus_critical: number };
  usage_trend: { increasing: number; stable: number; declining: number; no_usage: number };
  credit: { demand_30d: number; by_urgency: Record<UrgencyLevel, number>; topup_due_7d: number };
  revenue: { expected_at_risk: number; high_risk_exposure: number };
  /** Active-paid value×risk cells, sorted by revenue at risk (largest exposure first). */
  notable_cohorts: RunInsightCohort[];
};

export async function buildRunInsightSignals(runId: string): Promise<RunInsightSignals> {
  const o = mlPredictionOutputs;
  const inRun = eq(o.predictionRunId, runId);

  const [lifecycleRows, riskRows, trendRows, urgencyRows, [scalars], matrixRows] = await Promise.all([
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
      .where(and(inRun, sql`${o.customerValueTier} IS NOT NULL`, sql`${o.churnRiskLevel} IS NOT NULL`))
      .groupBy(o.customerValueTier, o.churnRiskLevel),
  ]);

  const lifecycle = { active_paid: 0, active_free: 0, churned: 0, ghost: 0 };
  for (const row of lifecycleRows) {
    if (row.stage === "Active Paid") lifecycle.active_paid = row.n;
    else if (row.stage === "Active Free") lifecycle.active_free = row.n;
    else if (row.stage === "Churned") lifecycle.churned = row.n;
    else if (row.stage === "Ghost") lifecycle.ghost = row.n;
  }

  const byRisk: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  let eligible = 0;
  for (const row of riskRows) {
    if (row.level && row.level in byRisk) byRisk[row.level as RiskLevel] = row.n;
    eligible += row.n;
  }

  const usageTrend = { increasing: 0, stable: 0, declining: 0, no_usage: 0 };
  for (const row of trendRows) {
    if (row.trend && row.trend in usageTrend) {
      usageTrend[row.trend as keyof typeof usageTrend] = row.n;
    }
  }

  const byUrgency: Record<UrgencyLevel, number> = { critical: 0, warning: 0, monitor: 0, stable: 0 };
  for (const row of urgencyRows) {
    if (row.level && row.level in byUrgency) byUrgency[row.level as UrgencyLevel] = row.n;
  }

  const notable = matrixRows
    .filter((row) => row.n > 0)
    .map((row) => ({
      value_tier: row.tier as ValueTier,
      risk_level: row.level as RiskLevel,
      count: row.n,
      clv_sum: Math.round(row.clvSum),
      revenue_at_risk: Math.round(row.revAtRisk),
    }))
    .sort((a, b) => b.revenue_at_risk - a.revenue_at_risk)
    .slice(0, 6);

  return {
    total_customers: scalars.total,
    lifecycle,
    churn: { eligible, by_risk: byRisk, high_plus_critical: byRisk.high + byRisk.critical },
    usage_trend: usageTrend,
    credit: { demand_30d: Math.round(scalars.demand30d), by_urgency: byUrgency, topup_due_7d: scalars.topupDue7d },
    revenue: {
      expected_at_risk: Math.round(scalars.expectedAtRisk),
      high_risk_exposure: Math.round(scalars.highRiskExposure),
    },
    notable_cohorts: notable,
  };
}
