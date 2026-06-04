/**
 * [NEW] Train raw data API — import 8-sheet Excel into train_data_sources + train_raw_sheet_*.
 */
import Elysia, { t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { trainDataSources, user } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { importTrainExcel, prepareTrainDataSource, type TrainImportResult } from "../lib/train-import";
import type { TrainImportProgressEvent } from "../lib/train-import-progress";
import { abortTrainDataSource, releaseStaleTrainImports } from "../lib/abort-data-source";
import { cleanTrainFromRaw } from "../lib/train-clean";
import { mapRawImportProgress } from "../lib/train-pipeline-progress";
import {
  publishTrainImportDone,
  publishTrainImportError,
  publishTrainPipelineProgress,
  readLatestTrainImportStreamEntry,
} from "../lib/train-import-stream";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function runTrainImportJob(
  sourceId: string,
  params: {
    buffer: Buffer;
    filename: string;
    name: string;
    client_label: string | null;
    notes: string | null;
    imported_by: string;
  }
): void {
  void (async () => {
    try {
      const result = await runTrainImportPipeline({ ...params, sourceId });
      await publishTrainImportDone(sourceId, result);
    } catch (e) {
      const err = e as Error & { code?: string; source_id?: string };
      if (err.code === "DUPLICATE_FILE") return;
      await publishTrainImportError(sourceId, err.message ?? "Import failed");
      await abortTrainDataSource(sourceId);
    }
  })();
}

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
  cleanManifest: unknown;
  cleanedAt: Date | null;
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
    clean_manifest: row.cleanManifest,
    cleaned_at: row.cleanedAt?.toISOString() ?? null,
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
  cleanManifest: trainDataSources.cleanManifest,
  cleanedAt: trainDataSources.cleanedAt,
  notes: trainDataSources.notes,
  errorMessage: trainDataSources.errorMessage,
  importedBy: trainDataSources.importedBy,
  createdAt: trainDataSources.createdAt,
  importerName: user.name,
  importerEmail: user.email,
};

async function publishRawProgress(
  sourceId: string,
  event: TrainImportProgressEvent
): Promise<void> {
  await publishTrainPipelineProgress(sourceId, {
    progress: mapRawImportProgress(event.progress),
    step: event.step,
    phase: "raw",
    sheet: event.sheet,
    rows: event.rows,
  });
}

async function runTrainImportPipeline(params: {
  buffer: Buffer;
  filename: string;
  name: string;
  client_label: string | null;
  notes: string | null;
  imported_by: string;
  sourceId: string;
}): Promise<TrainImportResult> {
  const sourceId = params.sourceId;
  try {
    await publishRawProgress(sourceId, { progress: 0, step: "Reading workbook…" });
    const rawResult = await importTrainExcel({
      buffer: params.buffer,
      filename: params.filename,
      name: params.name,
      client_label: params.client_label,
      notes: params.notes,
      imported_by: params.imported_by,
      sourceId,
      deferReadyCatalog: true,
      onProgress: (event) => {
        void publishRawProgress(sourceId, event);
      },
    });

    const cleanManifest = await cleanTrainFromRaw(sourceId, (event) => {
      void publishTrainPipelineProgress(sourceId, event);
    });

    return {
      ...rawResult,
      import_status: "ready",
      clean_manifest: cleanManifest,
    };
  } catch (e) {
    const err = e as Error & { code?: string };
    if (sourceId && err.code !== "DUPLICATE_FILE") {
      await abortTrainDataSource(sourceId);
    }
    throw e;
  }
}

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
    await releaseStaleTrainImports();
    const rows = await db
      .select(sourceSelect)
      .from(trainDataSources)
      .leftJoin(user, eq(trainDataSources.importedBy, user.id))
      .orderBy(desc(trainDataSources.createdAt));

    return rows.map(mapSource);
  })
  .get(
    "/:id/import/progress",
    async ({ params, set }) => {
      const sourceId = params.id;
      const [row] = await db
        .select({
          importStatus: trainDataSources.importStatus,
          errorMessage: trainDataSources.errorMessage,
          sheetManifest: trainDataSources.sheetManifest,
          cleanManifest: trainDataSources.cleanManifest,
        })
        .from(trainDataSources)
        .where(eq(trainDataSources.id, sourceId))
        .limit(1);

      if (!row) {
        set.status = 404;
        return { status: "not_found" as const, message: "Train data source not found" };
      }

      // DB terminal state wins over Redis progress. Progress events are published
      // fire-and-forget and can arrive after the final "done" stream entry.
      if (row.importStatus === "ready") {
        return {
          status: "ready" as const,
          progress: 100,
          step: "Ready for model training",
          phase: "clean" as const,
          result: {
            source_id: sourceId,
            import_status: "ready",
            sheet_manifest: (row.sheetManifest ?? {}) as Record<string, number>,
            clean_manifest: row.cleanManifest ?? undefined,
          },
        };
      }

      if (row.importStatus === "failed") {
        return {
          status: "failed" as const,
          progress: 0,
          step: row.errorMessage ?? "Import failed",
          message: row.errorMessage ?? "Import failed",
        };
      }

      const snap = await readLatestTrainImportStreamEntry(sourceId);

      if (snap.kind === "done") {
        return {
          status: "ready" as const,
          progress: 100,
          step: "Ready for model training",
          phase: "clean" as const,
          result: {
            source_id: snap.result.source_id,
            import_status: snap.result.import_status,
            sheet_manifest: snap.result.sheet_manifest,
            file_checksum_sha256: snap.result.file_checksum_sha256,
            clean_manifest: snap.result.clean_manifest,
          },
        };
      }

      if (snap.kind === "failed") {
        return {
          status: "failed" as const,
          progress: 0,
          step: snap.message,
          message: snap.message,
          code: snap.code,
          source_id: snap.source_id,
        };
      }

      if (snap.kind === "progress") {
        return {
          status: "importing" as const,
          progress: snap.event.progress,
          step: snap.event.step,
          phase: snap.event.phase,
          sheet: snap.event.sheet,
          rows: snap.event.rows,
        };
      }

      return {
        status: "importing" as const,
        progress: 0,
        step: "Waiting for import to start…",
        phase: "raw" as const,
      };
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
        const sourceId = await prepareTrainDataSource({
          buffer,
          filename,
          name: body.name,
          client_label: body.client_label ?? null,
          notes: body.notes ?? null,
          imported_by: userId!,
        });
        const result = await runTrainImportPipeline({
          buffer,
          filename,
          name: body.name,
          client_label: body.client_label ?? null,
          notes: body.notes ?? null,
          imported_by: userId!,
          sourceId,
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
        const sourceId = await prepareTrainDataSource({
          buffer,
          filename,
          name: body.name,
          client_label: body.client_label ?? null,
          notes: body.notes ?? null,
          imported_by: userId!,
        });

        await publishTrainPipelineProgress(sourceId, {
          progress: 3,
          step: "Upload received — connecting progress…",
          phase: "raw",
        });

        runTrainImportJob(sourceId, {
          buffer,
          filename,
          name: body.name,
          client_label: body.client_label ?? null,
          notes: body.notes ?? null,
          imported_by: userId!,
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
