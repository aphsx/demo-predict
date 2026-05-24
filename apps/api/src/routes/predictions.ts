import Elysia, { t } from "elysia";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { predictions, predictionRuns } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { verifyRunOwnership } from "../lib/run-guard";

// Simple CSV serializer — RFC 4180 compliant (quotes cells containing , " or \n)
function buildCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
}

// Explicit snake_case select — matches FastAPI SELECT * response shape
const PRED_SELECT = {
  id: predictions.id,
  run_id: predictions.runId,
  acc_id: predictions.accId,
  lifecycle_stage: predictions.lifecycleStage,
  sub_stage: predictions.subStage,
  churn_probability: predictions.churnProbability,
  predicted_clv_6m: predictions.predictedClv6m,
  clv_ci95_lo: predictions.clvCi95Lo,
  clv_ci95_hi: predictions.clvCi95Hi,
  clv_ci80_lo: predictions.clvCi80Lo,
  clv_ci80_hi: predictions.clvCi80Hi,
  p_alive: predictions.pAlive,
  credit_p10: predictions.creditP10,
  credit_p25: predictions.creditP25,
  credit_p50: predictions.creditP50,
  credit_p75: predictions.creditP75,
  credit_p90: predictions.creditP90,
  n_purchases: predictions.nPurchases,
  forecast_confidence: predictions.forecastConfidence,
  comeback_probability: predictions.comebackProbability,
  conversion_probability: predictions.conversionProbability,
  is_active: predictions.isActive,
  total_revenue: predictions.totalRevenue,
  days_since_last_activity: predictions.daysSinceLastActivity,
  ever_paid: predictions.everPaid,
  revenue_at_risk: predictions.revenueAtRisk,
  avg_transaction_value: predictions.avgTransactionValue,
  created_at: predictions.createdAt,
} as const;

export const predictionsRoutes = new Elysia({ prefix: "/runs" })
  .use(requireUser)

  // GET /runs/:id/predictions — paginated list with optional filters
  .get(
    "/:id/predictions",
    async ({ params, query, userId, set }) => {
      const guard = await verifyRunOwnership(params.id, userId!);
      if (!guard.ok) { set.status = guard.status; return { message: guard.message }; }

      const page = Math.max(1, Number(query.page ?? 1));
      const pageSize = Math.max(1, Math.min(200, Number(query.page_size ?? 50)));
      const offset = (page - 1) * pageSize;

      const conditions = [eq(predictions.runId, params.id)];
      if (query.lifecycle_stage) {
        conditions.push(eq(predictions.lifecycleStage, query.lifecycle_stage));
      }
      if (query.search) {
        conditions.push(
          sql`CAST(${predictions.accId} AS TEXT) LIKE ${"%" + query.search + "%"}`
        );
      }

      const where = and(...conditions);

      const [rows, [countRow]] = await Promise.all([
        db
          .select(PRED_SELECT)
          .from(predictions)
          .where(where)
          .orderBy(desc(predictions.churnProbability))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ total: sql<string>`count(*)` })
          .from(predictions)
          .where(where),
      ]);

      return {
        total: Number(countRow?.total ?? 0),
        page,
        page_size: pageSize,
        data: rows,
      };
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({
        page: t.Optional(t.String()),
        page_size: t.Optional(t.String()),
        lifecycle_stage: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    }
  )

  // GET /runs/:id/predictions/:acc_id — single customer prediction
  .get(
    "/:id/predictions/:acc_id",
    async ({ params, userId, set }) => {
      const guard = await verifyRunOwnership(params.id, userId!);
      if (!guard.ok) { set.status = guard.status; return { message: guard.message }; }

      const [row] = await db
        .select(PRED_SELECT)
        .from(predictions)
        .where(
          and(
            eq(predictions.runId, params.id),
            eq(predictions.accId, Number(params.acc_id))
          )
        )
        .limit(1);

      if (!row) { set.status = 404; return { message: "Customer not found" }; }
      return row;
    },
    {
      params: t.Object({ id: t.String(), acc_id: t.String() }),
    }
  )

  // GET /runs/:id/summary — aggregated dashboard KPIs
  .get(
    "/:id/summary",
    async ({ params, userId, set }) => {
      const guard = await verifyRunOwnership(params.id, userId!);
      if (!guard.ok) { set.status = guard.status; return { message: guard.message }; }

      const runId = params.id;

      const [stageRows, [activePaidRow], [winbackRow], [conversionRow], [runInfo]] =
        await Promise.all([
          // Lifecycle distribution
          db
            .select({
              lifecycle_stage: predictions.lifecycleStage,
              sub_stage: predictions.subStage,
              count: sql<string>`count(*)`,
            })
            .from(predictions)
            .where(eq(predictions.runId, runId))
            .groupBy(predictions.lifecycleStage, predictions.subStage)
            .orderBy(desc(sql`count(*)`)),

          // Active Paid KPIs
          db
            .select({
              total: sql<string>`count(*)`,
              avg_churn: sql<string>`ROUND(AVG(${predictions.churnProbability})::numeric, 4)`,
              avg_clv: sql<string>`ROUND(AVG(${predictions.predictedClv6m})::numeric, 0)`,
            })
            .from(predictions)
            .where(
              and(
                eq(predictions.runId, runId),
                eq(predictions.lifecycleStage, "Active Paid")
              )
            ),

          // Winback (Churned) KPIs
          db
            .select({
              total: sql<string>`count(*)`,
              avg_comeback: sql<string>`ROUND(AVG(${predictions.comebackProbability})::numeric, 4)`,
            })
            .from(predictions)
            .where(
              and(
                eq(predictions.runId, runId),
                eq(predictions.lifecycleStage, "Churned")
              )
            ),

          // Conversion (Active Free) KPIs
          db
            .select({
              total: sql<string>`count(*)`,
              avg_convert: sql<string>`ROUND(AVG(${predictions.conversionProbability})::numeric, 4)`,
            })
            .from(predictions)
            .where(
              and(
                eq(predictions.runId, runId),
                eq(predictions.lifecycleStage, "Active Free")
              )
            ),

          // Run metadata
          db
            .select({
              total_customers: predictionRuns.totalCustomers,
              active_customers: predictionRuns.activeCustomers,
              model_version_id: predictionRuns.modelVersionId,
            })
            .from(predictionRuns)
            .where(eq(predictionRuns.id, runId))
            .limit(1),
        ]);

      // Build lifecycle distribution object (mirrors FastAPI's grouping logic)
      const lifecycle: Record<
        string,
        { total: number; sub_stages: Record<string, number> }
      > = {};
      for (const r of stageRows) {
        const stage = r.lifecycle_stage ?? "Unknown";
        if (!lifecycle[stage]) lifecycle[stage] = { total: 0, sub_stages: {} };
        const cnt = Number(r.count);
        lifecycle[stage].total += cnt;
        lifecycle[stage].sub_stages[r.sub_stage ?? ""] = cnt;
      }

      return {
        lifecycle,
        active_paid: activePaidRow ?? {},
        winback: winbackRow ?? {},
        conversion: conversionRow ?? {},
        total_customers: runInfo?.total_customers ?? null,
        active_customers: runInfo?.active_customers ?? null,
        model_version_id: runInfo?.model_version_id ?? null,
      };
    },
    { params: t.Object({ id: t.String() }) }
  )

  // GET /runs/:id/export — CSV download of predictions
  .get(
    "/:id/export",
    async ({ params, query, userId, set }) => {
      const guard = await verifyRunOwnership(params.id, userId!);
      if (!guard.ok) { set.status = guard.status; return { message: guard.message }; }

      const conditions = [eq(predictions.runId, params.id)];
      if (query.lifecycle_stage) {
        conditions.push(eq(predictions.lifecycleStage, query.lifecycle_stage));
      }

      const rows = await db
        .select({
          acc_id:                   predictions.accId,
          lifecycle_stage:          predictions.lifecycleStage,
          sub_stage:                predictions.subStage,
          churn_probability:        predictions.churnProbability,
          predicted_clv_6m:         predictions.predictedClv6m,
          comeback_probability:     predictions.comebackProbability,
          conversion_probability:   predictions.conversionProbability,
          n_purchases:              predictions.nPurchases,
          total_revenue:            predictions.totalRevenue,
          days_since_last_activity: predictions.daysSinceLastActivity,
        })
        .from(predictions)
        .where(and(...conditions))
        .orderBy(sql`${predictions.churnProbability} DESC NULLS LAST`);

      const filename = `1moby_export_${query.lifecycle_stage || "all"}.csv`;
      return new Response(buildCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-cache",
        },
      });
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({ lifecycle_stage: t.Optional(t.String()) }),
    }
  );
