/**
 * [NEW] Predict raw data API — import Excel into predict_data_sources + predict_raw_sheet_*.
 * Replaces removed [LEGACY] POST /runs/:id/upload → raw_customers/payments/usage.
 */
import Elysia, { t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { predictDataSources, predictionRuns, user } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { verifyRunOwnership } from "../lib/run-guard";
import { importPredictExcel } from "../lib/predict-import";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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
  predictionRunId: string | null;
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
    prediction_run_id: row.predictionRunId,
    importer_name: row.importerName ?? null,
    importer_email: row.importerEmail ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

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
  notes: predictDataSources.notes,
  errorMessage: predictDataSources.errorMessage,
  importedBy: predictDataSources.importedBy,
  predictionRunId: predictDataSources.predictionRunId,
  createdAt: predictDataSources.createdAt,
  importerName: user.name,
  importerEmail: user.email,
};

export const predictDataRoutes = new Elysia({ prefix: "/predict-data-sources" })
  .use(requireUser)
  .get("/", async () => {
    const rows = await db
      .select(sourceSelect)
      .from(predictDataSources)
      .leftJoin(user, eq(predictDataSources.importedBy, user.id))
      .orderBy(desc(predictDataSources.createdAt));
    return rows.map(mapSource);
  })
  .get("/:id", async ({ params, set }) => {
    const rows = await db
      .select(sourceSelect)
      .from(predictDataSources)
      .leftJoin(user, eq(predictDataSources.importedBy, user.id))
      .where(eq(predictDataSources.id, params.id))
      .limit(1);

    if (rows.length === 0) {
      set.status = 404;
      return { message: "Predict data source not found" };
    }
    return mapSource(rows[0]);
  })
  .post(
    "/import",
    async ({ body, userId, set }) => {
      const filename = body.file.name ?? "upload.xlsx";
      if (!filename.toLowerCase().endsWith(".xlsx")) {
        set.status = 400;
        return { message: "Only .xlsx files are supported" };
      }

      if (body.prediction_run_id) {
        const guard = await verifyRunOwnership(body.prediction_run_id, userId!);
        if (!guard.ok) {
          set.status = guard.status;
          return { message: guard.message };
        }
      }

      const buffer = Buffer.from(await body.file.arrayBuffer());
      if (buffer.length > MAX_UPLOAD_BYTES) {
        set.status = 413;
        return { message: `File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit` };
      }

      const displayName =
        body.name?.trim() ||
        (body.prediction_run_id ? `Run ${body.prediction_run_id.slice(0, 8)}` : filename);

      try {
        const result = await importPredictExcel({
          buffer,
          filename,
          name: displayName,
          imported_by: userId!,
          prediction_run_id: body.prediction_run_id ?? null,
          client_label: body.client_label ?? null,
          notes: body.notes ?? null,
        });

        if (body.prediction_run_id) {
          const customerCount =
            result.sheet_manifest["Users+User_profile"] ?? null;
          await db
            .update(predictionRuns)
            .set({
              status: "imported",
              totalCustomers: customerCount,
              errorMessage: null,
            })
            .where(eq(predictionRuns.id, body.prediction_run_id));
        }

        return result;
      } catch (e) {
        const err = e as Error;
        set.status = 400;
        return { message: err.message ?? "Import failed" };
      }
    },
    {
      body: t.Object({
        file: t.File(),
        name: t.Optional(t.String()),
        client_label: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        prediction_run_id: t.Optional(t.String()),
      }),
    }
  );
