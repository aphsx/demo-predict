/**
 * [NEW] ML v2 prediction runs API — docs/ML-V2-DASHBOARD-SPEC.md §4/§7.
 * Response contract mirrors apps/web/src/lib/mlApi.ts (snake_case keys).
 */
import Elysia, { t } from "elysia";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import {
  mlModelAliases,
  mlModelVersions,
  mlPredictionOutputs,
  mlPredictionRuns,
  predictDataSources,
  user,
} from "../db/schema";
import { canMutateOwnedRecord, denyMutation } from "../lib/access-control";
import { requireUser } from "../lib/auth-middleware";
import { triggerMlJob } from "../lib/ml-internal";
import {
  DEFAULT_RISK_THRESHOLDS,
  EMPTY_MODEL_VERSIONS,
  monthKeysBeforeCutoff,
  num,
  UUID_RE,
  type ChurnFactor,
  type LifecycleStage,
  type ModelEligibility,
  type MonthlyUsagePoint,
  type OutputsPage,
  type PaymentEvent,
  type PredictionOutput,
  type PredictionRun,
  type ProfileSnapshot,
  type RiskLevel,
  type RunStatus,
  type RunSummary,
  type UrgencyLevel,
  type ValueTier,
} from "../lib/ml-contract";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Run row mapping ─────────────────────────────────────────────

const runSelect = {
  id: mlPredictionRuns.id,
  name: mlPredictionRuns.name,
  status: mlPredictionRuns.status,
  predictSourceId: mlPredictionRuns.predictSourceId,
  predictSourceName: predictDataSources.name,
  cutoffDate: mlPredictionRuns.cutoffDate,
  totalCustomers: mlPredictionRuns.totalCustomers,
  createdBy: mlPredictionRuns.createdBy,
  creatorName: user.name,
  createdAt: mlPredictionRuns.createdAt,
  finishedAt: mlPredictionRuns.finishedAt,
  errorMessage: mlPredictionRuns.errorMessage,
  progressJson: mlPredictionRuns.progressJson,
};

interface RunRow {
  id: string;
  name: string;
  status: string;
  predictSourceId: string;
  predictSourceName: string | null;
  cutoffDate: string;
  totalCustomers: number | null;
  createdBy: string | null;
  creatorName: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
  progressJson: unknown;
}

function mapRun(row: RunRow): PredictionRun {
  return {
    id: row.id,
    name: row.name,
    status: row.status as RunStatus,
    predict_source_id: row.predictSourceId,
    predict_source_name: row.predictSourceName ?? row.predictSourceId,
    cutoff_date: row.cutoffDate,
    total_customers: row.totalCustomers,
    created_by: row.creatorName ?? row.createdBy,
    created_at: row.createdAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
    error_message: row.errorMessage,
    progress:
      row.status === "in_progress"
        ? ((row.progressJson as { step: string; pct: number } | null) ?? null)
        : null,
  };
}

async function fetchRun(id: string): Promise<RunRow | null> {
  if (!UUID_RE.test(id)) return null;
  const rows = await db
    .select(runSelect)
    .from(mlPredictionRuns)
    .leftJoin(predictDataSources, eq(mlPredictionRuns.predictSourceId, predictDataSources.id))
    .leftJoin(user, eq(mlPredictionRuns.createdBy, user.id))
    .where(eq(mlPredictionRuns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// ── Output row mapping ──────────────────────────────────────────

const EMPTY_SNAPSHOT: ProfileSnapshot = {
  join_date: "",
  customer_age_days: 0,
  status_sms: null,
  status_email: null,
  credit_sms: 0,
  credit_email: 0,
  expire_sms: null,
  expire_email: null,
  last_access: null,
  last_send: null,
  sms_usage_share: 0,
  email_usage_share: 0,
  bc_usage_share: 0,
  api_usage_share: 0,
  otp_usage_share: 0,
  usage_total_180d: 0,
};

const FALLBACK_ELIGIBILITY: ModelEligibility = {
  eligible: false,
  status: "not_eligible",
  reason: null,
};

type OutputRow = typeof mlPredictionOutputs.$inferSelect;

function mapOutput(row: OutputRow): PredictionOutput {
  const eligibility = row.modelEligibilityJson as {
    churn?: ModelEligibility;
    clv?: ModelEligibility;
    credit?: ModelEligibility;
  } | null;
  return {
    prediction_run_id: row.predictionRunId,
    acc_id: row.accId,
    lifecycle_stage: (row.lifecycleStage ?? "Ghost") as LifecycleStage,
    sub_stage: row.subStage ?? row.lifecycleStage ?? "Ghost",
    days_since_last_activity: row.daysSinceLastActivity,
    n_purchases: row.nPurchases ?? 0,
    total_revenue: num(row.totalRevenue) ?? 0,
    avg_transaction_value: num(row.avgTransactionValue),
    ever_paid: row.everPaid,
    usage_trend: (row.usageTrend ?? "no_usage") as PredictionOutput["usage_trend"],
    profile_snapshot: (row.profileSnapshotJson as ProfileSnapshot | null) ?? EMPTY_SNAPSHOT,
    churn_probability: num(row.churnProbability),
    churn_risk_level: (row.churnRiskLevel as RiskLevel | null) ?? null,
    churn_factors: (row.churnFactorsJson as ChurnFactor[] | null) ?? null,
    predicted_clv_6m: num(row.predictedClv6m),
    p_alive: num(row.pAlive),
    customer_value_tier: (row.customerValueTier ?? "none") as ValueTier,
    predicted_credit_usage_30d: num(row.predictedCreditUsage30d),
    predicted_credit_usage_90d: num(row.predictedCreditUsage90d),
    credit_forecast_interval:
      (row.creditForecastIntervalJson as PredictionOutput["credit_forecast_interval"]) ?? null,
    estimated_days_until_topup: row.estimatedDaysUntilTopup,
    credit_urgency_level: (row.creditUrgencyLevel as UrgencyLevel | null) ?? null,
    revenue_at_risk: num(row.revenueAtRisk),
    priority_score: num(row.priorityScore) ?? 0,
    priority_reason: row.priorityReason ?? "",
    ai_status: row.aiStatus as PredictionOutput["ai_status"],
    ai_explanation: row.aiExplanation,
    ai_recommended_message: row.aiRecommendedMessage,
    output_status: row.outputStatus as PredictionOutput["output_status"],
    model_eligibility: {
      churn: eligibility?.churn ?? FALLBACK_ELIGIBILITY,
      clv: eligibility?.clv ?? FALLBACK_ELIGIBILITY,
      credit: eligibility?.credit ?? FALLBACK_ELIGIBILITY,
    },
    model_versions:
      (row.modelVersionsJson as PredictionOutput["model_versions"] | null) ?? EMPTY_MODEL_VERSIONS,
  };
}

// ── Outputs query (sort whitelist, filters) ─────────────────────

const SORT_COLUMNS = {
  priority_score: mlPredictionOutputs.priorityScore,
  lifecycle_stage: mlPredictionOutputs.lifecycleStage,
  churn_probability: mlPredictionOutputs.churnProbability,
  predicted_clv_6m: mlPredictionOutputs.predictedClv6m,
  revenue_at_risk: mlPredictionOutputs.revenueAtRisk,
  total_revenue: mlPredictionOutputs.totalRevenue,
  days_since_last_activity: mlPredictionOutputs.daysSinceLastActivity,
  estimated_days_until_topup: mlPredictionOutputs.estimatedDaysUntilTopup,
  ai_status: mlPredictionOutputs.aiStatus,
  acc_id: mlPredictionOutputs.accId,
} as const;

function parseSort(sort: string | undefined): SQL {
  const [field, dir] = (sort ?? "priority_score:desc").split(":");
  const column =
    SORT_COLUMNS[(field ?? "") as keyof typeof SORT_COLUMNS] ?? SORT_COLUMNS.priority_score;
  const direction = dir === "asc" ? sql.raw("ASC") : sql.raw("DESC");
  return sql`${column} ${direction} NULLS LAST`;
}

interface OutputsQueryParams {
  page?: number;
  page_size?: number;
  sort?: string;
  search?: string;
  lifecycle_stage?: string;
  churn_risk_level?: string;
  customer_value_tier?: string;
  credit_urgency_level?: string;
  ever_paid?: string;
}

function outputFilters(runId: string, q: OutputsQueryParams): SQL | undefined {
  const o = mlPredictionOutputs;
  const conds: SQL[] = [eq(o.predictionRunId, runId)];
  if (q.search) conds.push(sql`${o.accId}::text LIKE ${`%${q.search}%`}`);
  if (q.lifecycle_stage) conds.push(eq(o.lifecycleStage, q.lifecycle_stage));
  if (q.churn_risk_level) conds.push(eq(o.churnRiskLevel, q.churn_risk_level));
  if (q.customer_value_tier) conds.push(eq(o.customerValueTier, q.customer_value_tier));
  if (q.credit_urgency_level) conds.push(eq(o.creditUrgencyLevel, q.credit_urgency_level));
  if (q.ever_paid === "true" || q.ever_paid === "false") {
    conds.push(eq(o.everPaid, q.ever_paid === "true"));
  }
  return and(...conds);
}

// ── Summary helpers ─────────────────────────────────────────────

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
        priorityReason: o.priorityReason,
      })
      .from(o)
      .where(inRun)
      .orderBy(sql`${o.priorityScore} DESC NULLS LAST`, asc(o.accId))
      .limit(10),
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
      priority_reason: row.priorityReason ?? "",
    })),
    model_versions:
      (run.modelVersionsJson as RunSummary["model_versions"] | null) ?? EMPTY_MODEL_VERSIONS,
  };
}

// ── Routes ──────────────────────────────────────────────────────

export const predictionRunRoutes = new Elysia({ prefix: "/prediction-runs" })
  .use(requireUser)
  .get("/", async () => {
    const rows = await db
      .select(runSelect)
      .from(mlPredictionRuns)
      .leftJoin(predictDataSources, eq(mlPredictionRuns.predictSourceId, predictDataSources.id))
      .leftJoin(user, eq(mlPredictionRuns.createdBy, user.id))
      .orderBy(desc(mlPredictionRuns.createdAt));
    return rows.map(mapRun);
  })
  .post(
    "/",
    async ({ body, userId, set }) => {
      if (!UUID_RE.test(body.predict_source_id)) {
        set.status = 400;
        return { message: "predict_source_id must be a UUID" };
      }
      if (body.cutoff_date !== undefined && !DATE_RE.test(body.cutoff_date)) {
        set.status = 400;
        return { message: "cutoff_date must be YYYY-MM-DD" };
      }
      const [source] = await db
        .select({ id: predictDataSources.id, importStatus: predictDataSources.importStatus })
        .from(predictDataSources)
        .where(eq(predictDataSources.id, body.predict_source_id))
        .limit(1);
      if (!source) {
        set.status = 404;
        return { message: "Predict data source not found" };
      }
      if (source.importStatus !== "ready") {
        set.status = 400;
        return { message: "Predict data source must be ready before prediction" };
      }
      const [suggested] = await db.execute<{ cutoff_date: string | null }>(sql`
        SELECT to_char(latest + 1, 'YYYY-MM-DD') AS cutoff_date
        FROM (
          SELECT GREATEST(
            (SELECT MAX(payment_date)::date
             FROM predict_clean_payments WHERE source_id = ${body.predict_source_id}),
            (SELECT MAX(make_date(year, month, 1))
             FROM predict_clean_usage
             WHERE source_id = ${body.predict_source_id}
               AND year IS NOT NULL
               AND month IS NOT NULL)
          ) AS latest
        ) s
      `);
      const cutoffDate = body.cutoff_date ?? suggested?.cutoff_date;
      if (!cutoffDate) {
        set.status = 400;
        return { message: "No clean activity data for this source yet" };
      }

      const [inserted] = await db
        .insert(mlPredictionRuns)
        .values({
          predictSourceId: body.predict_source_id,
          name: body.name,
          cutoffDate,
          status: "pending",
          createdBy: userId!,
        })
        .returning({ id: mlPredictionRuns.id });

      try {
        await triggerMlJob("/internal/prediction-runs", { prediction_run_id: inserted.id });
      } catch (e) {
        await db
          .update(mlPredictionRuns)
          .set({ status: "failed", errorMessage: (e as Error).message })
          .where(eq(mlPredictionRuns.id, inserted.id));
      }

      const run = await fetchRun(inserted.id);
      return mapRun(run!);
    },
    {
      body: t.Object({
        predict_source_id: t.String(),
        name: t.String({ minLength: 1 }),
        cutoff_date: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/:id",
    async ({ params, set }) => {
      const run = await fetchRun(params.id);
      if (!run) {
        set.status = 404;
        return { message: "Prediction run not found" };
      }
      return mapRun(run);
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/:id/retry",
    async ({ params, userId, set }) => {
      const run = await fetchRun(params.id);
      if (!run) {
        set.status = 404;
        return { message: "Prediction run not found" };
      }
      if (!canMutateOwnedRecord(userId, run.createdBy)) {
        return denyMutation(set, "Only the run creator can retry it.");
      }
      if (run.status !== "failed") {
        set.status = 400;
        return { message: "Only failed runs can be retried" };
      }

      await db
        .update(mlPredictionRuns)
        .set({ status: "pending", errorMessage: null, progressJson: null })
        .where(eq(mlPredictionRuns.id, run.id));

      try {
        await triggerMlJob("/internal/prediction-runs", { prediction_run_id: run.id });
      } catch (e) {
        await db
          .update(mlPredictionRuns)
          .set({ status: "failed", errorMessage: (e as Error).message })
          .where(eq(mlPredictionRuns.id, run.id));
      }

      const fresh = await fetchRun(run.id);
      return mapRun(fresh!);
    },
    { params: t.Object({ id: t.String() }) }
  )
  .delete(
    "/:id",
    async ({ params, userId, set }) => {
      const run = await fetchRun(params.id);
      if (!run) {
        set.status = 404;
        return { message: "Prediction run not found" };
      }
      if (!canMutateOwnedRecord(userId, run.createdBy)) {
        return denyMutation(set, "Only the run creator can delete it.");
      }
      await db.delete(mlPredictionRuns).where(eq(mlPredictionRuns.id, run.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String() }) }
  )
  .get(
    "/:id/summary",
    async ({ params, set }) => {
      if (!UUID_RE.test(params.id)) {
        set.status = 404;
        return { message: "Prediction run not found" };
      }
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
      if (!row) {
        set.status = 404;
        return { message: "Prediction run not found" };
      }
      return buildSummary(row);
    },
    { params: t.Object({ id: t.String() }) }
  )
  .get(
    "/:id/outputs",
    async ({ params, query, set }): Promise<OutputsPage | { message: string }> => {
      const run = await fetchRun(params.id);
      if (!run) {
        set.status = 404;
        return { message: "Prediction run not found" };
      }

      const page = Math.max(1, query.page ?? 1);
      const pageSize = Math.min(200, Math.max(1, query.page_size ?? 8));
      const where = outputFilters(run.id, query);

      const [[{ total }], rows] = await Promise.all([
        db
          .select({ total: sql<number>`COUNT(*)::int` })
          .from(mlPredictionOutputs)
          .where(where),
        db
          .select()
          .from(mlPredictionOutputs)
          .where(where)
          .orderBy(parseSort(query.sort), asc(mlPredictionOutputs.accId))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
      ]);

      return { total, page, page_size: pageSize, data: rows.map(mapOutput) };
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({
        page: t.Optional(t.Numeric()),
        page_size: t.Optional(t.Numeric()),
        sort: t.Optional(t.String()),
        search: t.Optional(t.String()),
        lifecycle_stage: t.Optional(t.String()),
        churn_risk_level: t.Optional(t.String()),
        customer_value_tier: t.Optional(t.String()),
        credit_urgency_level: t.Optional(t.String()),
        ever_paid: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/:id/outputs/:acc_id",
    async ({ params, set }) => {
      const accId = Number(params.acc_id);
      if (!UUID_RE.test(params.id) || !Number.isInteger(accId)) {
        set.status = 404;
        return { message: "Prediction output not found" };
      }
      const [row] = await db
        .select()
        .from(mlPredictionOutputs)
        .where(
          and(
            eq(mlPredictionOutputs.predictionRunId, params.id),
            eq(mlPredictionOutputs.accId, accId)
          )
        )
        .limit(1);
      if (!row) {
        set.status = 404;
        return { message: "Prediction output not found" };
      }
      return mapOutput(row);
    },
    { params: t.Object({ id: t.String(), acc_id: t.String() }) }
  )
  .get(
    "/:id/customers/:acc_id/usage-monthly",
    async ({ params, set }): Promise<MonthlyUsagePoint[] | { message: string }> => {
      const accId = Number(params.acc_id);
      const run = await fetchRun(params.id);
      if (!run || !Number.isInteger(accId)) {
        set.status = 404;
        return { message: "Prediction run not found" };
      }

      const rows = await db.execute<{
        month: string;
        sms: number;
        email: number;
        bc: number;
        api: number;
        otp: number;
        total: number;
      }>(sql`
        SELECT to_char(make_date(year, month, 1), 'YYYY-MM') AS month,
               COALESCE(SUM(usage) FILTER (WHERE channel = 'sms'), 0)::float8 AS sms,
               COALESCE(SUM(usage) FILTER (WHERE channel = 'email'), 0)::float8 AS email,
               COALESCE(SUM(usage) FILTER (WHERE usage_source = 'bc'), 0)::float8 AS bc,
               COALESCE(SUM(usage) FILTER (WHERE usage_source = 'api'), 0)::float8 AS api,
               COALESCE(SUM(usage) FILTER (WHERE usage_source = 'otp'), 0)::float8 AS otp,
               COALESCE(SUM(usage), 0)::float8 AS total
        FROM predict_clean_usage
        WHERE source_id = ${run.predictSourceId}
          AND acc_id = ${accId}
          AND year IS NOT NULL
          AND month IS NOT NULL
          AND make_date(year, month, 1) >= date_trunc('month', ${run.cutoffDate}::date) - INTERVAL '12 months'
          AND make_date(year, month, 1) < date_trunc('month', ${run.cutoffDate}::date)
        GROUP BY 1
      `);

      const byMonth = new Map(rows.map((r) => [r.month, r]));
      return monthKeysBeforeCutoff(run.cutoffDate).map((month) => {
        const row = byMonth.get(month);
        return {
          month,
          sms: row?.sms ?? 0,
          email: row?.email ?? 0,
          bc: row?.bc ?? 0,
          api: row?.api ?? 0,
          otp: row?.otp ?? 0,
          total: row?.total ?? 0,
        };
      });
    },
    { params: t.Object({ id: t.String(), acc_id: t.String() }) }
  )
  .get(
    "/:id/customers/:acc_id/payments",
    async ({ params, set }): Promise<PaymentEvent[] | { message: string }> => {
      const accId = Number(params.acc_id);
      const run = await fetchRun(params.id);
      if (!run || !Number.isInteger(accId)) {
        set.status = 404;
        return { message: "Prediction run not found" };
      }

      const rows = await db.execute<{
        payment_date: Date;
        amount: number;
        credit_add: number;
        credit_type: string;
      }>(sql`
        SELECT payment_date,
               COALESCE(amount, 0)::float8 AS amount,
               COALESCE(credit_add, 0)::float8 AS credit_add,
               COALESCE(credit_type, '') AS credit_type
        FROM predict_clean_payments
        WHERE source_id = ${run.predictSourceId}
          AND acc_id = ${accId}
          AND payment_date < ${run.cutoffDate}::date
        ORDER BY payment_date DESC
        LIMIT 50
      `);

      return rows.map((row) => ({
        payment_date: new Date(row.payment_date).toISOString(),
        amount: row.amount,
        credit_add: row.credit_add,
        credit_type: row.credit_type,
      }));
    },
    { params: t.Object({ id: t.String(), acc_id: t.String() }) }
  );
