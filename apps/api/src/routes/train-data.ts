/**
 * [NEW] Train raw data API — import 8-sheet Excel into train_data_sources + train_raw_sheet_*.
 */
import Elysia, { t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { trainDataSources, user } from "../db/schema";
import { requireOwnedForMutation } from "../lib/access-control";
import { requireUser } from "../lib/auth-middleware";
import { UUID_RE } from "../lib/constants";
import { getTrainCutoffSuggestion } from "../lib/clean-cutoff";
import { prepareTrainDataSource } from "../lib/train-import";
import { releaseStaleTrainImports } from "../lib/abort-data-source";
import {
  publishTrainPipelineProgress,
  readLatestTrainImportStreamEntry,
} from "../lib/train-import-stream";
import {
  readImportBuffer,
  runTrainImportJob,
  runTrainImportPipeline,
} from "../lib/train-import-orchestrator";
import { isXlsxFilename, mapDataSourceRow } from "../lib/data-import/data-source-dto";

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

export const trainDataRoutes = new Elysia({ prefix: "/train-data-sources" })
  .use(requireUser)
  .get("/", async () => {
    await releaseStaleTrainImports();
    const rows = await db
      .select(sourceSelect)
      .from(trainDataSources)
      .leftJoin(user, eq(trainDataSources.importedBy, user.id))
      .orderBy(desc(trainDataSources.createdAt));

    return rows.map(mapDataSourceRow);
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
    return mapDataSourceRow(rows[0]);
  })
  // Gate 3 suggestion: latest training cutoff whose label horizon is fully
  // observed. Python checks `max_activity >= cutoff + horizon`, so the latest
  // safe cutoff is `latest_activity_date - horizon`.
  .get(
    "/:id/suggested-cutoff",
    async ({ params, set }) => {
      if (!UUID_RE.test(params.id)) {
        set.status = 404;
        return { message: "Train data source not found" };
      }
      const [source] = await db
        .select({ id: trainDataSources.id })
        .from(trainDataSources)
        .where(eq(trainDataSources.id, params.id))
        .limit(1);
      if (!source) {
        set.status = 404;
        return { message: "Train data source not found" };
      }

      const HORIZON_DAYS = 180;
      const { cutoff_date, latest_data_date } = await getTrainCutoffSuggestion(
        params.id,
        HORIZON_DAYS
      );
      if (!cutoff_date || !latest_data_date) {
        set.status = 400;
        return { message: "No clean activity data for this source yet" };
      }
      return {
        suggested_cutoff: cutoff_date,
        latest_data_date: latest_data_date,
        horizon_days: HORIZON_DAYS,
      };
    },
    { params: t.Object({ id: t.String() }) }
  )
  .delete(
    "/:id",
    async ({ params, userId, set }) => {
      const [row] = await db
        .select({
          importStatus: trainDataSources.importStatus,
          importedBy: trainDataSources.importedBy,
        })
        .from(trainDataSources)
        .where(eq(trainDataSources.id, params.id))
        .limit(1);

      const denied = requireOwnedForMutation(row, row?.importedBy, userId, set, {
        notFound: "Train data source not found",
        forbidden: "You can view this training data source, but only the importer can delete it.",
      });
      if (denied) return denied;

      await db.delete(trainDataSources).where(eq(trainDataSources.id, params.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/import",
    async ({ body, userId, set }) => {
      const filename = body.file.name ?? "upload.xlsx";
      if (!isXlsxFilename(filename)) {
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
      if (!isXlsxFilename(filename)) {
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
