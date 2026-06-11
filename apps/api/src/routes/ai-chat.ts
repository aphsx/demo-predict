import Elysia, { t } from "elysia";
import { requireUser } from "../lib/auth-middleware";
import { searchCompanyKnowledge } from "../lib/ai/company-knowledge";
import {
  generateFinalAnswer,
  generateTextToSqlPlan,
  getOllamaConfig,
  mapOllamaErrorCode,
} from "../lib/ai/ollama";
import { executeReadOnlySql, type QueryResultPreview } from "../lib/ai/sql-executor";
import { validateTextToSql } from "../lib/ai/sql-guard";
import { getAiUserRole } from "../lib/ai/semantic-layer";
import { checkUserQuestionSafety, sanitizeRetrievedText } from "../lib/ai/safety";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

const MAX_MESSAGES = 24;
const MAX_CONTENT_CHARS = 12_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_CONTENT_CHARS),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-MAX_MESSAGES);
}

function extractAccountChurnQuestion(question: string): number | null {
  const hasChurnIntent = /churn|เลิกใช้|เลิกใช้งาน|ความเสี่ยง|เสี่ยง/i.test(question);
  if (!hasChurnIntent) return null;

  const explicit = question.match(/(?:account|acc(?:ount)?_?id|บัญชี)\s*[:#]?\s*(\d{3,})/i)?.[1];
  const fallback = explicit ?? question.match(/\b(\d{5,})\b/)?.[1];
  if (!fallback) return null;

  const accId = Number(fallback);
  return Number.isSafeInteger(accId) ? accId : null;
}

function accountChurnSql(runId: string, accId: number): string {
  return `
WITH selected_run AS (
  SELECT id, predict_source_id, name, cutoff_date, status
  FROM ml_prediction_runs
  WHERE id = '${runId}'
  LIMIT 1
),
account_output AS (
  SELECT *
  FROM ml_prediction_outputs
  WHERE prediction_run_id = '${runId}'
    AND acc_id = ${accId}
  LIMIT 1
),
account_profile AS (
  SELECT c.*
  FROM predict_clean_customers c
  JOIN selected_run r ON r.predict_source_id = c.source_id
  WHERE c.acc_id = ${accId}
  LIMIT 1
),
usage_12m AS (
  SELECT
    COALESCE(SUM(u.usage), 0)::float8 AS usage_12m,
    MAX(make_date(u.year, u.month, 1)) FILTER (WHERE u.usage > 0) AS last_usage_month,
    COALESCE(SUM(u.usage) FILTER (
      WHERE make_date(u.year, u.month, 1) >= date_trunc('month', r.cutoff_date::date) - INTERVAL '3 months'
    ), 0)::float8 AS usage_last_3m
  FROM selected_run r
  LEFT JOIN predict_clean_usage u
    ON u.source_id = r.predict_source_id
   AND u.acc_id = ${accId}
   AND u.year IS NOT NULL
   AND u.month IS NOT NULL
   AND make_date(u.year, u.month, 1) >= date_trunc('month', r.cutoff_date::date) - INTERVAL '12 months'
   AND make_date(u.year, u.month, 1) < date_trunc('month', r.cutoff_date::date)
  GROUP BY r.id
),
payment_summary AS (
  SELECT
    COUNT(p.*)::int AS n_payments_before_cutoff,
    COALESCE(SUM(p.amount), 0)::float8 AS revenue_before_cutoff,
    MAX(p.payment_date) AS last_payment_date
  FROM selected_run r
  LEFT JOIN predict_clean_payments p
    ON p.source_id = r.predict_source_id
   AND p.acc_id = ${accId}
   AND p.payment_date < r.cutoff_date::date
  GROUP BY r.id
)
SELECT
  r.id AS prediction_run_id,
  r.name AS prediction_run_name,
  r.cutoff_date,
  r.status AS prediction_run_status,
  COALESCE(o.acc_id, c.acc_id) AS acc_id,
  o.lifecycle_stage,
  o.sub_stage,
  o.churn_probability,
  o.churn_risk_level,
  o.days_since_last_activity,
  o.usage_trend,
  o.priority_score,
  o.priority_reason,
  o.revenue_at_risk,
  o.churn_factors_json,
  c.status_sms,
  c.status_email,
  c.credit_sms,
  c.credit_email,
  c.expire_sms,
  c.expire_email,
  c.last_access,
  c.last_send,
  u.usage_12m,
  u.usage_last_3m,
  u.last_usage_month,
  p.n_payments_before_cutoff,
  p.revenue_before_cutoff,
  p.last_payment_date
FROM selected_run r
LEFT JOIN account_output o ON TRUE
LEFT JOIN account_profile c ON TRUE
LEFT JOIN usage_12m u ON TRUE
LEFT JOIN payment_summary p ON TRUE
WHERE o.acc_id IS NOT NULL OR c.acc_id IS NOT NULL
LIMIT 1`.trim();
}

export const aiChatRoutes = new Elysia({ prefix: "/ai-chat" })
  .use(requireUser)
  .post(
    "/",
    async ({ body, set }) => {
      const config = getOllamaConfig();
      if (!config.apiKey) {
        set.status = 503;
        return {
          message: "OLLAMA_API_KEY is not configured",
          code: "ollama_not_configured",
        };
      }

      const messages = normalizeMessages(body.messages);
      if (messages.length === 0) {
        set.status = 400;
        return {
          message: "At least one non-empty message is required",
          code: "empty_messages",
        };
      }

      try {
        const role = getAiUserRole();
        const latestQuestion = messages[messages.length - 1]?.content ?? "";
        const safety = checkUserQuestionSafety(latestQuestion);
        if (!safety.ok) {
          set.status = 400;
          return {
            message: safety.blockedReason ?? "Question was blocked by AI safety policy.",
            code: "ai_safety_blocked",
            detail: safety.warnings.join("; ") || undefined,
          };
        }

        const knowledgeHits = searchCompanyKnowledge(latestQuestion);
        const runId = body.run_id?.trim();
        const accountChurnAccId = extractAccountChurnQuestion(latestQuestion);
        const useAccountChurnTemplate = accountChurnAccId !== null;

        let sql: string | null = null;
        let queryResult: QueryResultPreview | null = null;
        const warnings: string[] = [...safety.warnings];
        let blockedReason: string | null = null;
        let sqlReasoning = "text_to_sql_not_needed";
        let answerWithoutQuery: string | undefined;

        if (useAccountChurnTemplate) {
          sqlReasoning = "account_churn_investigation_template";
          if (!runId || !UUID_RE.test(runId)) {
            answerWithoutQuery =
              "คำถามนี้ต้องใช้ prediction run ที่เลือกอยู่เพื่อ scope ข้อมูล account ให้ถูกต้อง แต่ request ไม่มี run_id ที่ถูกต้อง จึงยังไม่สามารถดึง evidence จากฐานข้อมูลได้";
          } else {
            sql = accountChurnSql(runId, accountChurnAccId);
            queryResult = await executeReadOnlySql(sql);
            if (queryResult.row_count === 0) {
              answerWithoutQuery = `ไม่พบ account ${accountChurnAccId} ใน prediction run ${runId} หรือ clean customer profile ของ source เดียวกัน`;
            }
          }
        } else {
          const plan = await generateTextToSqlPlan({ config, role, messages });
          sqlReasoning = plan.reasoning;
          answerWithoutQuery = plan.answer_without_query;
          if (plan.warning) warnings.push(plan.warning);

          if (plan.should_query && plan.sql) {
            const validation = validateTextToSql(plan.sql, role);
            if (validation.ok) {
              sql = validation.sql;
              warnings.push(...validation.warnings);
              queryResult = await executeReadOnlySql(validation.sql);
            } else {
              blockedReason = validation.reason;
              warnings.push(`SQL blocked: ${validation.reason}`);
            }
          }
        }

        const knowledgeEvidence = knowledgeHits
          .map((hit) => `${hit.title} (${hit.source}): ${sanitizeRetrievedText(hit.content)}`)
          .join("\n\n");
        const directAnswer = blockedReason
          ? `คำถามนี้ต้อง query ฐานข้อมูล แต่ SQL ที่ AI สร้างถูกบล็อก: ${blockedReason}`
          : [answerWithoutQuery, knowledgeEvidence].filter(Boolean).join("\n\n");

        const content = await generateFinalAnswer({
          config,
          messages,
          sql,
          queryResult,
          warnings,
          directAnswer,
        });

        return {
          model: config.model,
          message: {
            role: "assistant" as const,
            content,
          },
          evidence: {
            mode: sql ? "text_to_sql" : "knowledge_or_direct",
            role,
            sql,
            sql_reasoning: sqlReasoning,
            warnings,
            blocked_reason: blockedReason,
            query_result: queryResult
              ? {
                  columns: queryResult.columns,
                  row_count: queryResult.row_count,
                  rows: queryResult.rows,
                }
              : null,
            sources: knowledgeHits.map((hit) => ({
              source: hit.source,
              title: hit.title,
              score: hit.score,
            })),
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "AI chat request failed";
        const code = mapOllamaErrorCode(errorMessage);
        set.status = code === "ollama_request_failed" ? 502 : 400;
        return {
          message: errorMessage,
          code,
          detail: errorMessage.slice(0, 500),
        };
      }
    },
    {
      body: t.Object({
        messages: t.Array(
          t.Object({
            role: t.Union([t.Literal("user"), t.Literal("assistant")]),
            content: t.String({ minLength: 1, maxLength: MAX_CONTENT_CHARS }),
          }),
          { minItems: 1, maxItems: MAX_MESSAGES }
        ),
        run_id: t.Optional(t.String()),
      }),
    }
  );
