import Elysia, { t } from "elysia";
import IORedis from "ioredis";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { predictionRuns } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { verifyRunOwnership } from "../lib/run-guard";

const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379);

// Arq progress stream entries: [[id, [field, value, ...]], ...]
type StreamEntry = [id: string, fields: string[]];
type XReadResult = Array<[key: string, entries: StreamEntry[]]> | null;

const enc = new TextEncoder();

function sseFrame(event: string, data: string): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${data}\n\n`);
}

export const eventsRoutes = new Elysia()
  .use(requireUser)
  .get(
    "/runs/:id/stream",
    ({ params, userId }) => {
      const runId = params.id;
      const uid   = userId!;

      let streamRedis: IORedis | null = null;
      let cancelled = false;

      const stream = new ReadableStream({
        async start(controller) {
          // Ownership check before streaming anything
          const guard = await verifyRunOwnership(runId, uid);
          if (!guard.ok) {
            controller.enqueue(sseFrame("error", JSON.stringify({ message: guard.message })));
            controller.close();
            return;
          }

          const streamKey = `progress:${runId}`;

          try {
            streamRedis = new IORedis(REDIS_PORT, REDIS_HOST, {
              lazyConnect: false,
              maxRetriesPerRequest: 1,
            });

            let lastId = "0";

            while (!cancelled) {
              // XREAD blocks up to 1 s — dedicated connection, no other commands
              const result = (await streamRedis.xread(
                "COUNT", "10",
                "BLOCK", "1000",
                "STREAMS", streamKey, lastId
              )) as unknown as XReadResult;

              if (result && !cancelled) {
                for (const [, entries] of result) {
                  for (const [msgId, fields] of entries) {
                    lastId = msgId;

                    // Fields arrive as a flat [k, v, k, v, ...] array
                    const fieldMap = new Map<string, string>();
                    for (let i = 0; i < fields.length; i += 2) {
                      fieldMap.set(fields[i], fields[i + 1]);
                    }
                    const progress = Number(fieldMap.get("progress") ?? "0");
                    const step     = fieldMap.get("step") ?? "";
                    const isDone   = progress >= 100 || step.startsWith("failed");

                    controller.enqueue(
                      sseFrame("progress", JSON.stringify({
                        progress,
                        step,
                        status: isDone ? (step.startsWith("failed") ? "failed" : "done") : "processing",
                      }))
                    );

                    if (isDone) {
                      controller.close();
                      return;
                    }
                  }
                }
              }

              if (cancelled) break;

              // After each XREAD timeout, also check DB for final status
              const [run] = await db
                .select({ status: predictionRuns.status })
                .from(predictionRuns)
                .where(eq(predictionRuns.id, runId))
                .limit(1);

              if (run && (run.status === "done" || run.status === "failed")) {
                controller.enqueue(sseFrame("done", JSON.stringify({ status: run.status })));
                break;
              }
            }
          } catch {
            // Redis unreachable — fall back to DB polling every 5 s
            if (!cancelled) {
              while (!cancelled) {
                const [run] = await db
                  .select({
                    status:          predictionRuns.status,
                    total_customers: predictionRuns.totalCustomers,
                    active_customers: predictionRuns.activeCustomers,
                    error_message:   predictionRuns.errorMessage,
                    updated_at:      predictionRuns.updatedAt,
                  })
                  .from(predictionRuns)
                  .where(eq(predictionRuns.id, runId))
                  .limit(1);

                if (!run) {
                  controller.enqueue(sseFrame("error", "Run not found"));
                  break;
                }

                controller.enqueue(
                  sseFrame("status", JSON.stringify({
                    status:           run.status,
                    progress:         run.status === "processing" ? 50 : run.status === "done" ? 100 : 0,
                    step:             "",
                    total_customers:  run.total_customers,
                    active_customers: run.active_customers,
                    error_message:    run.error_message,
                    updated_at:       run.updated_at?.toISOString() ?? null,
                  }))
                );

                if (run.status === "done" || run.status === "failed") {
                  controller.enqueue(sseFrame("done", JSON.stringify({ status: run.status })));
                  break;
                }

                await new Promise<void>(r => setTimeout(r, 5000));
              }
            }
          } finally {
            streamRedis?.disconnect();
            try { controller.close(); } catch { /* already closed */ }
          }
        },

        cancel() {
          cancelled = true;
          streamRedis?.disconnect();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type":      "text/event-stream",
          "Cache-Control":     "no-cache",
          "Connection":        "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    },
    { params: t.Object({ id: t.String() }) }
  );
