import { GoogleGenerativeAI } from "@google/generative-ai";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { predictions, predictionRuns } from "../db/schema";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";

export function getModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(key).getGenerativeModel({ model: GEMINI_MODEL });
}

export function modelName(): string {
  return GEMINI_MODEL;
}

/**
 * Build a structured system prompt from the run's prediction data.
 * Injected into every Gemini request so the model has real numbers to cite.
 */
export async function buildRunContext(runId: string): Promise<string> {
  const [runInfo] = await db
    .select({
      cutoff_date:       predictionRuns.cutoffDate,
      total_customers:   predictionRuns.totalCustomers,
      active_customers:  predictionRuns.activeCustomers,
    })
    .from(predictionRuns)
    .where(eq(predictionRuns.id, runId))
    .limit(1);

  // Lifecycle distribution
  const stageRows = await db
    .select({
      lifecycle_stage: predictions.lifecycleStage,
      count:           sql<string>`count(*)`,
    })
    .from(predictions)
    .where(eq(predictions.runId, runId))
    .groupBy(predictions.lifecycleStage)
    .orderBy(desc(sql`count(*)`));

  // KPIs per stage
  const [ap] = await db
    .select({
      total:     sql<string>`count(*)`,
      avg_churn: sql<string>`ROUND(AVG(${predictions.churnProbability})::numeric, 4)`,
      avg_clv:   sql<string>`ROUND(AVG(${predictions.predictedClv6m})::numeric, 0)`,
    })
    .from(predictions)
    .where(and(eq(predictions.runId, runId), eq(predictions.lifecycleStage, "Active Paid")));

  const [wb] = await db
    .select({ avg_comeback: sql<string>`ROUND(AVG(${predictions.comebackProbability})::numeric, 4)` })
    .from(predictions)
    .where(and(eq(predictions.runId, runId), eq(predictions.lifecycleStage, "Churned")));

  const [cv] = await db
    .select({ avg_convert: sql<string>`ROUND(AVG(${predictions.conversionProbability})::numeric, 4)` })
    .from(predictions)
    .where(and(eq(predictions.runId, runId), eq(predictions.lifecycleStage, "Active Free")));

  // Top 5 high-risk Active Paid accounts
  const topRisk = await db
    .select({
      acc_id:            predictions.accId,
      churn_probability: predictions.churnProbability,
      predicted_clv_6m:  predictions.predictedClv6m,
    })
    .from(predictions)
    .where(and(eq(predictions.runId, runId), eq(predictions.lifecycleStage, "Active Paid")))
    .orderBy(desc(predictions.churnProbability))
    .limit(5);

  const stageCounts = Object.fromEntries(
    stageRows.map(r => [r.lifecycle_stage ?? "Unknown", Number(r.count)])
  );

  const fmt = (v: string | null | undefined) => (v == null ? "N/A" : v);
  const pct = (v: string | null | undefined) =>
    v == null ? "N/A" : `${(Number(v) * 100).toFixed(1)}%`;
  const thb = (v: string | null | undefined) =>
    v == null ? "N/A" : `${Number(v).toLocaleString()} THB`;

  const topRiskLines = topRisk.map(r =>
    `  - acc_id ${r.acc_id}: churn ${pct(r.churn_probability)}, CLV ${thb(r.predicted_clv_6m)}`
  ).join("\n") || "  (no Active Paid accounts)";

  return `
You are Moby AI, a customer intelligence analyst for 1Moby (B2B SaaS messaging — SMS & Email).
You have access to the latest customer prediction run data. Always cite actual numbers from the data below.
Answer in the same language as the user (Thai or English). Be concise and action-oriented.

## Run Information
- Cutoff date: ${fmt(runInfo?.cutoff_date)}
- Total customers in portfolio: ${runInfo?.total_customers ?? "N/A"}

## Lifecycle Distribution
- Active Paid:  ${stageCounts["Active Paid"]  ?? 0}
- Active Free:  ${stageCounts["Active Free"]  ?? 0}
- Churned:      ${stageCounts["Churned"]       ?? 0}
- Ghost:        ${stageCounts["Ghost"]         ?? 0}

## Key Performance Indicators
Active Paid cohort (${fmt(ap?.total)} accounts):
  - Avg churn probability: ${pct(ap?.avg_churn)}
  - Avg predicted CLV (6m): ${thb(ap?.avg_clv)}

Churned cohort:
  - Avg comeback probability: ${pct(wb?.avg_comeback)}

Active Free cohort:
  - Avg conversion probability: ${pct(cv?.avg_convert)}

## Top 5 Highest-Risk Active Paid Accounts
${topRiskLines}
`.trim();
}
