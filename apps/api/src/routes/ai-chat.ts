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

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

const MAX_MESSAGES = 24;
const MAX_CONTENT_CHARS = 12_000;

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_CONTENT_CHARS),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-MAX_MESSAGES);
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
        const knowledgeHits = searchCompanyKnowledge(latestQuestion);
        const plan = await generateTextToSqlPlan({ config, role, messages });

        let sql: string | null = null;
        let queryResult: QueryResultPreview | null = null;
        const warnings: string[] = [];
        let blockedReason: string | null = null;

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

        const knowledgeEvidence = knowledgeHits
          .map((hit) => `${hit.title} (${hit.source}): ${hit.content}`)
          .join("\n\n");
        const directAnswer = blockedReason
          ? `คำถามนี้ต้อง query ฐานข้อมูล แต่ SQL ที่ AI สร้างถูกบล็อก: ${blockedReason}`
          : [plan.answer_without_query, knowledgeEvidence].filter(Boolean).join("\n\n");

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
            sql_reasoning: plan.reasoning,
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
      }),
    }
  );
