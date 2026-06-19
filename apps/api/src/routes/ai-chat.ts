/**
 * AI Chat routes — complete rebuild.
 *
 * Conversations are persisted to PostgreSQL (ai_conversations / ai_messages).
 * Sending a message streams a token-by-token SSE response from the orchestrator.
 *
 * Routes:
 *   GET    /ai-chat/conversations
 *   POST   /ai-chat/conversations
 *   GET    /ai-chat/conversations/:id
 *   PATCH  /ai-chat/conversations/:id
 *   DELETE /ai-chat/conversations/:id
 *   POST   /ai-chat/conversations/:id/messages   → SSE stream
 *
 * All routes require auth (requireUser). All queries are scoped to userId.
 */

import Elysia, { t } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { aiConversations, aiMessages } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { denyNotFound } from "../lib/access-control";
import { orchestrate, sseError, generateConversationTitle } from "../lib/ai";
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

// ── Routes ─────────────────────────────────────────────────────────────────────

export const aiChatRoutes = new Elysia({ prefix: "/ai-chat" })
  .use(requireUser)

  // ── List conversations ───────────────────────────────────────────────────────
  .get(
    "/conversations",
    async ({ userId }) => {
      const convs = await db
        .select({
          id: aiConversations.id,
          title: aiConversations.title,
          archived: aiConversations.archived,
          createdAt: aiConversations.createdAt,
          updatedAt: aiConversations.updatedAt,
        })
        .from(aiConversations)
        .where(and(eq(aiConversations.userId, userId!), eq(aiConversations.archived, false)))
        .orderBy(desc(aiConversations.updatedAt))
        .limit(50);
      return convs;
    }
  )

  // ── Create conversation ──────────────────────────────────────────────────────
  .post(
    "/conversations",
    async ({ body, userId }) => {
      const [conv] = await db
        .insert(aiConversations)
        .values({
          userId: userId!,
          title: body.title?.trim() || "New chat",
        })
        .returning();

      return conv;
    },
    {
      body: t.Object({
        title: t.Optional(t.String({ maxLength: 100 })),
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

      const updates: { title?: string; archived?: boolean; updatedAt: Date } = { updatedAt: new Date() };
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

      // Auto-title: if this is the first message, generate a title
      const [firstMsg] = await db
        .select({ id: aiMessages.id })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, params.id))
        .limit(1);

      if (!firstMsg && conv.title === "New chat") {
        // Fire-and-forget — don't block the stream
        generateConversationTitle(userMessage).then((title) => {
          db.update(aiConversations)
            .set({ title })
            .where(eq(aiConversations.id, params.id))
            .catch(() => null);
        });
      }

      // Build the SSE stream from the orchestrator async generator
      const gen = orchestrate({
        conversationId: params.id,
        userId: userId!,
        userMessage,
      });

      const readable = new ReadableStream<Uint8Array>({
        async start(controller) {
          const enc = new TextEncoder();
          try {
            for await (const chunk of gen) {
              controller.enqueue(enc.encode(chunk));
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Stream error";
            controller.enqueue(enc.encode(sseError(msg, "stream_error")));
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
