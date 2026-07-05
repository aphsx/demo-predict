/**
 * [NEW] Predict raw + clean API — Excel → predict_raw_sheet_* → predict_clean_*.
 *
 * Org-shared model: reads are org-wide; importing is admin-only. A successful
 * import auto-triggers a prediction run (opt out with auto_run=false).
 */
import Elysia, { t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { predictDataSources, user } from "../db/schema";
import { requireAdmin, requireUser } from "../lib/auth-middleware";
import { denyNotFound } from "../lib/access-control";
import { UUID_RE, MAX_UPLOAD_BYTES } from "../lib/constants";
import { importPredictExcel, type PredictImportResult } from "../lib/predict-import";
import { abortPredictDataSource } from "../lib/abort-data-source";
import { cleanPredictFromRaw } from "../lib/predict-clean";
import { isXlsxFilename, mapDataSourceRow } from "../lib/data-import/data-source-dto";
import { getPredictCutoffSuggestion } from "../lib/clean-cutoff";
import { createAutoPredictionRun } from "../lib/auto-prediction-run";

const sourceSelect = {
  id: predictDataSources.id,
  name: predictDataSources.name,
  clientLabel: predictDataSources.clientLabel,
  originalFilename: predictDataSources.originalFilename,
  fileChecksumSha256: predictDataSources.fileChecksumSha256,
  fileSizeBytes: predictDataSources.fileSizeBytes,
  importStatus: predictDataSources.importStatus,
  importedAt: predictDataSources.importedAt,
  sheetManifest: predictDataSources.sheetManifest,
  cleanManifest: predictDataSources.cleanManifest,
  cleanedAt: predictDataSources.cleanedAt,
  notes: predictDataSources.notes,
  errorMessage: predictDataSources.errorMessage,
  importedBy: predictDataSources.importedBy,
  createdAt: predictDataSources.createdAt,
  importerName: user.name,
  importerEmail: user.email,
};

// Admin-only: importing/replacing shared predict data.
const adminPredictDataRoutes = new Elysia()
  .use(requireAdmin)
  .post(
    "/import",
    async ({ body, userId, set }) => {
      const filename = body.file.name ?? "upload.xlsx";
      if (!isXlsxFilename(filename)) {
        set.status = 400;
        return { message: "Only .xlsx files are supported" };
      }

      const buffer = Buffer.from(await body.file.arrayBuffer());
      if (buffer.length > MAX_UPLOAD_BYTES) {
        set.status = 413;
        return { message: `File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit` };
      }

      const displayName = body.name?.trim() || filename;

      let sourceId = "";

      try {
        const rawResult = await importPredictExcel({
          buffer,
          filename,
          name: displayName,
          imported_by: userId!,
          client_label: body.client_label ?? null,
          notes: body.notes ?? null,
          deferReadyCatalog: true,
        });
        sourceId = rawResult.source_id;

        const cleanManifest = await cleanPredictFromRaw(sourceId);
        const result: PredictImportResult = {
          ...rawResult,
          import_status: "ready",
          clean_manifest: cleanManifest,
        };

        // Auto prediction run (default on; opt out with auto_run=false). Fully
        // isolated from import success — createAutoPredictionRun never throws.
        const autoRunWanted = body.auto_run !== false && body.auto_run !== "false";
        const autoRunId = autoRunWanted
          ? await createAutoPredictionRun({
              predictSourceId: sourceId,
              sourceName: displayName,
              createdBy: userId!,
            })
          : null;

        return { ...result, auto_prediction_run_id: autoRunId };
      } catch (e) {
        const err = e as Error;
        const message = err.message?.slice(0, 500) ?? "Import failed";
        if (sourceId) {
          await abortPredictDataSource(sourceId);
        }
        set.status = 400;
        return { message };
      }
    },
    {
      body: t.Object({
        file: t.File(),
        name: t.Optional(t.String()),
        client_label: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        // Multipart form fields arrive as strings — accept both JSON booleans
        // and "true"/"false" literals. Default (omitted) = auto-run enabled.
        auto_run: t.Optional(t.Union([t.Boolean(), t.Literal("true"), t.Literal("false")])),
      }),
    }
  );

export const predictDataRoutes = new Elysia({ prefix: "/predict-data-sources" })
  .use(requireUser)
  .get("/", async () => {
    const rows = await db
      .select(sourceSelect)
      .from(predictDataSources)
      .leftJoin(user, eq(predictDataSources.importedBy, user.id))
      .orderBy(desc(predictDataSources.createdAt));
    return rows.map(mapDataSourceRow);
  })
  .get("/:id", async ({ params, set }) => {
    const rows = await db
      .select(sourceSelect)
      .from(predictDataSources)
      .leftJoin(user, eq(predictDataSources.importedBy, user.id))
      .where(eq(predictDataSources.id, params.id))
      .limit(1);

    if (rows.length === 0) return denyNotFound(set, "Predict data source not found");
    return mapDataSourceRow(rows[0]);
  })
  // Suggested prediction cutoff = day after the latest observed activity
  // (payments + usage months) in the source's clean tables.
  .get(
    "/:id/suggested-cutoff",
    async ({ params, set }) => {
      if (!UUID_RE.test(params.id)) return denyNotFound(set, "Predict data source not found");
      const [source] = await db
        .select({ id: predictDataSources.id })
        .from(predictDataSources)
        .where(eq(predictDataSources.id, params.id))
        .limit(1);
      if (!source) return denyNotFound(set, "Predict data source not found");

      const { cutoff_date, latest_data_date } = await getPredictCutoffSuggestion(params.id);
      if (!cutoff_date) {
        set.status = 400;
        return { message: "No clean activity data for this source yet" };
      }
      return {
        suggested_cutoff: cutoff_date,
        latest_data_date: latest_data_date,
      };
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

      const buffer = Buffer.from(await body.file.arrayBuffer());
      if (buffer.length > MAX_UPLOAD_BYTES) {
        set.status = 413;
        return { message: `File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit` };
      }

      const displayName =
        body.name?.trim() || filename;

      let sourceId = "";

      try {
        const rawResult = await importPredictExcel({
          buffer,
          filename,
          name: displayName,
          imported_by: userId!,
          client_label: body.client_label ?? null,
          notes: body.notes ?? null,
          deferReadyCatalog: true,
        });
        sourceId = rawResult.source_id;

        const cleanManifest = await cleanPredictFromRaw(sourceId);
        const result: PredictImportResult = {
          ...rawResult,
          import_status: "ready",
          clean_manifest: cleanManifest,
        };

        return result;
      } catch (e) {
        const err = e as Error;
        const message = err.message?.slice(0, 500) ?? "Import failed";
        if (sourceId) {
          await abortPredictDataSource(sourceId);
        }
        set.status = 400;
        return { message };
      }
    },
    {
      body: t.Object({
        file: t.File(),
        name: t.Optional(t.String()),
        client_label: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
    }
  );
