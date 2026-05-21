import Elysia, { t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { explanations } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { verifyRunOwnership } from "../lib/run-guard";
import { buildRunContext, getModel, modelName } from "../services/gemini";

const enc = new TextEncoder();

export const insightsRoutes = new Elysia()
  .use(requireUser)

  // POST /runs/:id/explain — generate a one-shot analysis and persist it
  .post(
    "/runs/:id/explain",
    async ({ params, userId, set }) => {
      const guard = await verifyRunOwnership(params.id, userId!);
      if (!guard.ok) { set.status = guard.status; return { message: guard.message }; }

      let model;
      try { model = getModel(); } catch {
        set.status = 503;
        return { message: "GEMINI_API_KEY is not configured" };
      }

      const context = await buildRunContext(params.id);
      const prompt = `${context}\n\nGenerate a concise executive summary of this customer portfolio. Cover: overall health, top churn risks, growth opportunities (conversion + winback), and 3 recommended immediate actions. Use markdown formatting.`;

      let content: string;
      try {
        const result = await model.generateContent(prompt);
        content = result.response.text();
      } catch (err) {
        set.status = 502;
        const msg = err instanceof Error ? err.message : String(err);
        return { message: `Gemini error: ${msg}` };
      }

      const [saved] = await db
        .insert(explanations)
        .values({ runId: params.id, content, model: modelName() })
        .returning({
          id:         explanations.id,
          run_id:     explanations.runId,
          content:    explanations.content,
          model:      explanations.model,
          created_at: explanations.createdAt,
        });
      return saved;
    },
    { params: t.Object({ id: t.String() }) }
  )

  // GET /runs/:id/explanation — fetch the latest stored explanation
  .get(
    "/runs/:id/explanation",
    async ({ params, userId, set }) => {
      const guard = await verifyRunOwnership(params.id, userId!);
      if (!guard.ok) { set.status = guard.status; return { message: guard.message }; }

      const [row] = await db
        .select({
          id:         explanations.id,
          run_id:     explanations.runId,
          content:    explanations.content,
          model:      explanations.model,
          created_at: explanations.createdAt,
        })
        .from(explanations)
        .where(eq(explanations.runId, params.id))
        .orderBy(desc(explanations.createdAt))
        .limit(1);

      if (!row) { set.status = 404; return { message: "No explanation generated yet" }; }
      return row;
    },
    { params: t.Object({ id: t.String() }) }
  )

  // POST /runs/:id/chat — multi-turn streaming chat with run context
  .post(
    "/runs/:id/chat",
    ({ params, body, userId }) => {
      const runId  = params.id;
      const uid    = userId!;
      const msgs   = body.messages;

      const stream = new ReadableStream({
        async start(controller) {
          const guard = await verifyRunOwnership(runId, uid);
          if (!guard.ok) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: guard.message })}\n\n`));
            controller.close();
            return;
          }

          let model;
          try { model = getModel(); } catch {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: "GEMINI_API_KEY is not configured" })}\n\n`));
            controller.close();
            return;
          }

          let context: string;
          try { context = await buildRunContext(runId); } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: `Context build error: ${msg}` })}\n\n`));
            controller.close();
            return;
          }

          // Split history from the latest user message
          const history = msgs.slice(0, -1);
          const lastMsg = msgs[msgs.length - 1];

          try {
            const chat = model.startChat({
              history: history.map(m => ({
                role:  m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
              })),
              systemInstruction: context,
            });

            const result = await chat.sendMessageStream(lastMsg.content);
            for await (const chunk of result.stream) {
              const text = chunk.text();
              if (text) {
                controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));
              }
            }
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type":      "text/event-stream",
          "Cache-Control":     "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        messages: t.Array(
          t.Object({
            role:    t.Union([t.Literal("user"), t.Literal("assistant")]),
            content: t.String(),
          }),
          { minItems: 1 }
        ),
      }),
    }
  );
