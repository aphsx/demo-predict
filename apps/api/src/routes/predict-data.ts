/**
 * [NEW] Predict raw + clean API — Excel → predict_raw_sheet_* → predict_clean_*.
 */
import Elysia, { t } from "elysia";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { predictDataSources, user } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { UUID_RE } from "../lib/ml-contract";
import { importPredictExcel, type PredictImportResult } from "../lib/predict-import";
import { abortPredictDataSource } from "../lib/abort-data-source";
import { cleanPredictFromRaw } from "../lib/predict-clean";

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
  // Suggested prediction cutoff = day after the latest observed activity
  // (payments + usage months) in the source's clean tables.
  .get(
    "/:id/suggested-cutoff",
    async ({ params, set }) => {
      if (!UUID_RE.test(params.id)) {
        set.status = 404;
        return { message: "Predict data source not found" };
      }
      const [source] = await db
        .select({ id: predictDataSources.id })
        .from(predictDataSources)
        .where(eq(predictDataSources.id, params.id))
        .limit(1);
      if (!source) {
        set.status = 404;
        return { message: "Predict data source not found" };
      }

      const [row] = await db.execute<{
        suggested_cutoff: string | null;
        latest_data_date: string | null;
      }>(sql`
        SELECT to_char(latest + 1, 'YYYY-MM-DD') AS suggested_cutoff,
               to_char(latest, 'YYYY-MM-DD') AS latest_data_date
        FROM (
          SELECT GREATEST(
            (SELECT MAX(payment_date)::date
             FROM predict_clean_payments WHERE source_id = ${params.id}),
            (SELECT MAX(make_date(year, month, 1))
             FROM predict_clean_usage
             WHERE source_id = ${params.id} AND year IS NOT NULL AND month IS NOT NULL)
          ) AS latest
        ) s
      `);
      if (!row?.suggested_cutoff) {
        set.status = 400;
        return { message: "No clean activity data for this source yet" };
      }
      return {
        suggested_cutoff: row.suggested_cutoff,
        latest_data_date: row.latest_data_date,
      };
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
        return { message: err.message ?? "Import failed" };
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
