/**
 * AI Chat routes.
 *
 * Conversations persist to PostgreSQL (ai_conversations / ai_messages) and may
 * be bound to a prediction run (ai_conversations.run_id). A bound conversation
 * hard-scopes every Text-to-SQL query to that run; a global conversation can
 * query across all the user's own runs. The binding is fixed at creation — a
 * chat about run A stays about run A even when the active run changes.
 *
 * Sending a message streams a token-by-token SSE response from the orchestrator.
 *
 * Routes (all require auth; all queries scoped to userId):
 *   GET    /ai-chat/config
 *   GET    /ai-chat/conversations
 *   POST   /ai-chat/conversations              { title?, run_id? }
 *   GET    /ai-chat/conversations/:id
 *   PATCH  /ai-chat/conversations/:id          { title?, archived? }
 *   DELETE /ai-chat/conversations/:id
 *   POST   /ai-chat/conversations/:id/messages → SSE stream
 */

import Elysia, { t } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { aiConversations, aiMessages, mlPredictionRuns } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { denyNotFound } from "../lib/access-control";
import { orchestrate, sseError } from "../lib/ai";
import { getLLMConfig, isLLMConfigured } from "../lib/ai/llm-config";
import { DEFAULT_CONVERSATION_TITLE, ERROR_CODE } from "../lib/ai/constants";
import { UUID_RE } from "../lib/constants";

const MAX_MESSAGE_CHARS = 12_000;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getConversation(id: string, userId: string) {
  const [conv] = await db
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)))
    .limit(1);
  return conv ?? null;
}

/** Verify the user owns a prediction run before binding a chat to it. */
async function userOwnsRun(runId: string, userId: string): Promise<boolean> {
  if (!UUID_RE.test(runId)) return false;
  const [row] = await db
    .select({ id: mlPredictionRuns.id })
    .from(mlPredictionRuns)
    .where(and(eq(mlPredictionRuns.id, runId), eq(mlPredictionRuns.createdBy, userId)))
    .limit(1);
  return Boolean(row);
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export const aiChatRoutes = new Elysia({ prefix: "/ai-chat" })
  .use(requireUser)

  // ── Public LLM config (so the UI shows the real provider/model) ──────────────
  .get("/config", () => {
    const c = getLLMConfig();
    return { configured: isLLMConfigured(), provider: c.provider, model: c.model };
  })

  // ── List conversations (+ bound run name) ────────────────────────────────────
  .get("/conversations", async ({ userId }) => {
    const convs = await db
      .select({
        id: aiConversations.id,
        title: aiConversations.title,
        archived: aiConversations.archived,
        runId: aiConversations.runId,
        runName: mlPredictionRuns.name,
        createdAt: aiConversations.createdAt,
        updatedAt: aiConversations.updatedAt,
      })
      .from(aiConversations)
      .leftJoin(mlPredictionRuns, eq(aiConversations.runId, mlPredictionRuns.id))
      .where(eq(aiConversations.userId, userId!))
      .orderBy(desc(aiConversations.updatedAt))
      .limit(100);
    return convs;
  })

  // ── Create conversation (optionally bound to a run) ──────────────────────────
  .post(
    "/conversations",
    async ({ body, userId, set }) => {
      let runId: string | null = null;
      if (body.run_id) {
        if (!(await userOwnsRun(body.run_id, userId!))) {
          set.status = 403;
          return { message: "Prediction run not found", code: "run_not_found" };
        }
        runId = body.run_id;
      }
      const [conv] = await db
        .insert(aiConversations)
        .values({
          userId: userId!,
          runId,
          title: body.title?.trim() || DEFAULT_CONVERSATION_TITLE,
        })
        .returning();
      return conv;
    },
    {
      body: t.Object({
        title: t.Optional(t.String({ maxLength: 100 })),
        run_id: t.Optional(t.String()),
      }),
    }
  )

  // ── Get conversation + messages ──────────────────────────────────────────────
  .get(
    "/conversations/:id",
    async ({ params, userId, set }) => {
      if (!UUID_RE.test(params.id)) return denyNotFound(set, "Not found");
      const conv = await getConversation(params.id, userId!);
      if (!conv) return denyNotFound(set, "Conversation not found");

      const msgs = await db
        .select({
          id: aiMessages.id,
          role: aiMessages.role,
          content: aiMessages.content,
          evidenceJson: aiMessages.evidenceJson,
          model: aiMessages.model,
          createdAt: aiMessages.createdAt,
        })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, params.id))
        .orderBy(aiMessages.id)
        .limit(200);

      return { ...conv, messages: msgs };
    },
    { params: t.Object({ id: t.String() }) }
  )

  // ── Rename / archive conversation ────────────────────────────────────────────
  .patch(
    "/conversations/:id",
    async ({ params, body, userId, set }) => {
      if (!UUID_RE.test(params.id)) return denyNotFound(set, "Not found");
      const conv = await getConversation(params.id, userId!);
      if (!conv) return denyNotFound(set, "Conversation not found");

      const updates: { title?: string; archived?: boolean; updatedAt: Date } = {
        updatedAt: new Date(),
      };
      if (body.title !== undefined) updates.title = body.title.trim().slice(0, 100) || conv.title;
      if (body.archived !== undefined) updates.archived = body.archived;

      const [updated] = await db
        .update(aiConversations)
        .set(updates)
        .where(eq(aiConversations.id, params.id))
        .returning();
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        title: t.Optional(t.String({ maxLength: 100 })),
        archived: t.Optional(t.Boolean()),
      }),
    }
  )

  // ── Delete conversation ──────────────────────────────────────────────────────
  .delete(
    "/conversations/:id",
    async ({ params, userId, set }) => {
      if (!UUID_RE.test(params.id)) return denyNotFound(set, "Not found");
      const conv = await getConversation(params.id, userId!);
      if (!conv) return denyNotFound(set, "Conversation not found");

      await db.delete(aiConversations).where(eq(aiConversations.id, params.id));
      set.status = 204;
      return null;
    },
    { params: t.Object({ id: t.String() }) }
  )

  // ── Send message → SSE stream ────────────────────────────────────────────────
  .post(
    "/conversations/:id/messages",
    async ({ params, body, userId, set }) => {
      if (!UUID_RE.test(params.id)) return denyNotFound(set, "Conversation not found");
      const conv = await getConversation(params.id, userId!);
      if (!conv) return denyNotFound(set, "Conversation not found");

      const userMessage = body.message.trim();
      if (!userMessage) {
        set.status = 400;
        return { message: "Message cannot be empty" };
      }

      // First message in a default-titled conversation → generate an auto-title.
      const [firstMsg] = await db
        .select({ id: aiMessages.id })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, params.id))
        .limit(1);
      const generateTitle = !firstMsg && conv.title === DEFAULT_CONVERSATION_TITLE;

      const gen = orchestrate({
        conversationId: params.id,
        userId: userId!,
        userMessage,
        boundRunId: conv.runId ?? null,
        generateTitle,
      });

      const readable = new ReadableStream<Uint8Array>({
        async start(controller) {
          const enc = new TextEncoder();
          try {
            for await (const chunk of gen) controller.enqueue(enc.encode(chunk));
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Stream error";
            controller.enqueue(enc.encode(sseError(msg, ERROR_CODE.STREAM_ERROR)));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        message: t.String({ minLength: 1, maxLength: MAX_MESSAGE_CHARS }),
      }),
    }
  );
