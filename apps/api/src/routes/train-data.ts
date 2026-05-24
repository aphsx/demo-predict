/**
 * [NEW] Train raw data API — import 8-sheet Excel into train_data_sources + train_raw_sheet_*.
 * Replaces (for training) the old pattern of filesystem + train.py only.
 * NOT used by /runs or prediction_runs. See docs/DATA-PIPELINE-MIGRATION.md.
 */
import Elysia, { t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { trainDataSources, user } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { importTrainExcel } from "../lib/train-import";

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

export const trainDataRoutes = new Elysia({ prefix: "/train-data-sources" })
  .use(requireUser)
  .get("/", async () => {
    const rows = await db
      .select({
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
      })
      .from(trainDataSources)
      .leftJoin(user, eq(trainDataSources.importedBy, user.id))
      .orderBy(desc(trainDataSources.createdAt));

    return rows.map(mapSource);
  })
  .get("/:id", async ({ params, set }) => {
    const rows = await db
      .select({
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
      })
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
  );
