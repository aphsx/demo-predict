/**
 * [NEW] Train raw data API — import 8-sheet Excel into train_data_sources + train_raw_sheet_*.
 */
import Elysia, { t } from "elysia";
import IORedis from "ioredis";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { trainDataSources, user } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { importTrainExcel, type TrainImportResult } from "../lib/train-import";
import { sseFrame } from "../lib/sse";
import {
  publishTrainImportDone,
  publishTrainImportError,
  publishTrainImportProgress,
  trainImportStreamKey,
} from "../lib/train-import-stream";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379);

type StreamEntry = [id: string, fields: string[]];
type XReadResult = Array<[key: string, entries: StreamEntry[]]> | null;

function mapSource(row: {
  id: string;
  name: string;
  clientLabel: string | null;
  originalFilename: string;
  fileChecksumSha256: string;
  fileSizeBytes: number | null;
  importStatus: string;
  importedAt: Date | null;
  sheetManifest: unknown;
  notes: string | null;
  errorMessage: string | null;
  importedBy: string | null;
  createdAt: Date;
  importerName?: string | null;
  importerEmail?: string | null;
}) {
  return {
    id: row.id,
    name: row.name,
    client_label: row.clientLabel,
    original_filename: row.originalFilename,
    file_checksum_sha256: row.fileChecksumSha256,
    file_size_bytes: row.fileSizeBytes,
    import_status: row.importStatus,
    imported_at: row.importedAt?.toISOString() ?? null,
    sheet_manifest: row.sheetManifest,
    notes: row.notes,
    error_message: row.errorMessage,
    imported_by: row.importedBy,
    importer_name: row.importerName ?? null,
    importer_email: row.importerEmail ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

const sourceSelect = {
  id: trainDataSources.id,
  name: trainDataSources.name,
  clientLabel: trainDataSources.clientLabel,
  originalFilename: trainDataSources.originalFilename,
  fileChecksumSha256: trainDataSources.fileChecksumSha256,
  fileSizeBytes: trainDataSources.fileSizeBytes,
  importStatus: trainDataSources.importStatus,
  importedAt: trainDataSources.importedAt,
  sheetManifest: trainDataSources.sheetManifest,
  notes: trainDataSources.notes,
  errorMessage: trainDataSources.errorMessage,
  importedBy: trainDataSources.importedBy,
  createdAt: trainDataSources.createdAt,
  importerName: user.name,
  importerEmail: user.email,
};

async function readImportBuffer(file: File): Promise<Buffer> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit`);
  }
  return buffer;
}

export const trainDataRoutes = new Elysia({ prefix: "/train-data-sources" })
  .use(requireUser)
  .get("/", async () => {
    const rows = await db
      .select(sourceSelect)
      .from(trainDataSources)
      .leftJoin(user, eq(trainDataSources.importedBy, user.id))
      .orderBy(desc(trainDataSources.createdAt));

    return rows.map(mapSource);
  })
  .get(
    "/:id/import/stream",
    ({ params }) => {
      const sourceId = params.id;
      let streamRedis: IORedis | null = null;
      let cancelled = false;

      const stream = new ReadableStream({
        async start(controller) {
          const streamKey = trainImportStreamKey(sourceId);

          try {
            streamRedis = new IORedis(REDIS_PORT, REDIS_HOST, {
              lazyConnect: false,
              maxRetriesPerRequest: 1,
            });

            let lastId = "0";

            while (!cancelled) {
              const result = (await streamRedis.xread(
                "COUNT", "10",
                "BLOCK", "1000",
                "STREAMS", streamKey, lastId
              )) as unknown as XReadResult;

              if (result && !cancelled) {
                for (const [, entries] of result) {
                  for (const [msgId, fields] of entries) {
                    lastId = msgId;
                    const fieldMap = new Map<string, string>();
                    for (let i = 0; i < fields.length; i += 2) {
                      fieldMap.set(fields[i], fields[i + 1]);
                    }

                    const status = fieldMap.get("status");
                    const progress = Number(fieldMap.get("progress") ?? "0");
                    const step = fieldMap.get("step") ?? "";

                    if (status === "failed") {
                      controller.enqueue(
                        sseFrame(
                          "error",
                          JSON.stringify({
                            message: fieldMap.get("message") ?? step,
                            code: fieldMap.get("code"),
                            source_id: fieldMap.get("source_id"),
                          })
                        )
                      );
                      controller.close();
                      return;
                    }

                    if (status === "done") {
                      const payloadRaw = fieldMap.get("payload");
                      const payload = payloadRaw
                        ? (JSON.parse(payloadRaw) as TrainImportResult)
                        : { source_id: sourceId, import_status: "ready" };
                      controller.enqueue(sseFrame("done", JSON.stringify(payload)));
                      controller.close();
                      return;
                    }

                    controller.enqueue(
                      sseFrame(
                        "progress",
                        JSON.stringify({
                          progress,
                          step,
                          sheet: fieldMap.get("sheet"),
                          rows: fieldMap.get("rows")
                            ? Number(fieldMap.get("rows"))
                            : undefined,
                        })
                      )
                    );
                  }
                }
              }

              if (cancelled) break;

              const [row] = await db
                .select({
                  importStatus: trainDataSources.importStatus,
                  errorMessage: trainDataSources.errorMessage,
                  sheetManifest: trainDataSources.sheetManifest,
                })
                .from(trainDataSources)
                .where(eq(trainDataSources.id, sourceId))
                .limit(1);

              if (!row) {
                controller.enqueue(sseFrame("error", JSON.stringify({ message: "Source not found" })));
                break;
              }

              if (row.importStatus === "ready") {
                controller.enqueue(
                  sseFrame(
                    "done",
                    JSON.stringify({
                      source_id: sourceId,
                      import_status: "ready",
                      sheet_manifest: row.sheetManifest ?? {},
                    })
                  )
                );
                break;
              }

              if (row.importStatus === "failed") {
                controller.enqueue(
                  sseFrame(
                    "error",
                    JSON.stringify({ message: row.errorMessage ?? "Import failed" })
                  )
                );
                break;
              }
            }
          } catch {
            controller.enqueue(
              sseFrame("error", JSON.stringify({ message: "Progress stream unavailable" }))
            );
          } finally {
            streamRedis?.disconnect();
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        },
        cancel() {
          cancelled = true;
          streamRedis?.disconnect();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    },
    { params: t.Object({ id: t.String() }) }
  )
  .get("/:id", async ({ params, set }) => {
    const rows = await db
      .select(sourceSelect)
      .from(trainDataSources)
      .leftJoin(user, eq(trainDataSources.importedBy, user.id))
      .where(eq(trainDataSources.id, params.id))
      .limit(1);

    if (rows.length === 0) {
      set.status = 404;
      return { message: "Train data source not found" };
    }
    return mapSource(rows[0]);
  })
  .delete(
    "/:id",
    async ({ params, set }) => {
      const [row] = await db
        .select({ importStatus: trainDataSources.importStatus })
        .from(trainDataSources)
        .where(eq(trainDataSources.id, params.id))
        .limit(1);

      if (!row) {
        set.status = 404;
        return { message: "Train data source not found" };
      }

      if (row.importStatus === "importing") {
        set.status = 400;
        return { message: "Cannot delete while import is in progress" };
      }

      await db.delete(trainDataSources).where(eq(trainDataSources.id, params.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/import",
    async ({ body, userId, set }) => {
      const filename = body.file.name ?? "upload.xlsx";
      if (!filename.toLowerCase().endsWith(".xlsx")) {
        set.status = 400;
        return { message: "Only .xlsx files are supported" };
      }

      const buffer = await readImportBuffer(body.file);

      try {
        const result = await importTrainExcel({
          buffer,
          filename,
          name: body.name,
          client_label: body.client_label ?? null,
          notes: body.notes ?? null,
          imported_by: userId!,
        });
        return result;
      } catch (e) {
        const err = e as Error & { code?: string; source_id?: string };
        if (err.code === "DUPLICATE_FILE") {
          set.status = 409;
          return { message: err.message, source_id: err.source_id };
        }
        set.status = 400;
        return { message: err.message ?? "Import failed" };
      }
    },
    {
      body: t.Object({
        file: t.File(),
        name: t.String({ minLength: 1 }),
        client_label: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
    }
  )
  .post(
    "/import/async",
    async ({ body, userId, set }) => {
      const filename = body.file.name ?? "upload.xlsx";
      if (!filename.toLowerCase().endsWith(".xlsx")) {
        set.status = 400;
        return { message: "Only .xlsx files are supported" };
      }

      let buffer: Buffer;
      try {
        buffer = await readImportBuffer(body.file);
      } catch (e) {
        set.status = 413;
        return { message: (e as Error).message };
      }

      try {
        const sourceId = await new Promise<string>((resolve, reject) => {
          void (async () => {
            let sid = "";
            try {
              const result = await importTrainExcel({
                buffer,
                filename,
                name: body.name,
                client_label: body.client_label ?? null,
                notes: body.notes ?? null,
                imported_by: userId!,
                onSourceCreated: (id) => {
                  sid = id;
                  resolve(id);
                },
                onProgress: (event) => {
                  if (sid) void publishTrainImportProgress(sid, event);
                },
              });
              await publishTrainImportDone(sid, result);
            } catch (e) {
              const err = e as Error & { code?: string; source_id?: string };
              if (!sid) {
                reject(err);
                return;
              }
              if (err.code === "DUPLICATE_FILE") {
                reject(err);
                return;
              }
              await publishTrainImportError(sid, err.message ?? "Import failed");
              await db
                .update(trainDataSources)
                .set({
                  importStatus: "failed",
                  errorMessage: err.message?.slice(0, 500) ?? "Import failed",
                })
                .where(eq(trainDataSources.id, sid));
            }
          })();
        });

        return { source_id: sourceId, import_status: "importing" };
      } catch (e) {
        const err = e as Error & { code?: string; source_id?: string };
        if (err.code === "DUPLICATE_FILE") {
          set.status = 409;
          return { message: err.message, source_id: err.source_id };
        }
        set.status = 400;
        return { message: err.message ?? "Import failed" };
      }
    },
    {
      body: t.Object({
        file: t.File(),
        name: t.String({ minLength: 1 }),
        client_label: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
    }
  );
