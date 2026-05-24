/**
 * [NEW] Train raw data API — import 8-sheet Excel into train_data_sources + train_raw_sheet_*.
 * Auth: requireUser on all routes; imports scoped to session user (imported_by → user.id).
 */
import Elysia, { t } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { trainDataSources, user } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";
import { importTrainExcel } from "../lib/train-import";
import { verifyTrainSourceOwnership } from "../lib/train-source-guard";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const SOURCE_SELECT = {
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
  importerImage: user.image,
} as const;

function mapSource(
  row: {
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
    importerImage?: string | null;
  },
  currentUserId: string
) {
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
    is_mine: row.importedBy === currentUserId,
    importer: row.importedBy
      ? {
          id: row.importedBy,
          name: row.importerName ?? null,
          email: row.importerEmail ?? null,
          image: row.importerImage ?? null,
        }
      : null,
    created_at: row.createdAt.toISOString(),
  };
}

async function fetchSourceForUser(sourceId: string, userId: string) {
  const rows = await db
    .select(SOURCE_SELECT)
    .from(trainDataSources)
    .leftJoin(user, eq(trainDataSources.importedBy, user.id))
    .where(
      and(eq(trainDataSources.id, sourceId), eq(trainDataSources.importedBy, userId))
    )
    .limit(1);
  return rows[0] ?? null;
}

export const trainDataRoutes = new Elysia({ prefix: "/train-data-sources" })
  .use(requireUser)
  .get("/", async ({ userId }) => {
    const rows = await db
      .select(SOURCE_SELECT)
      .from(trainDataSources)
      .leftJoin(user, eq(trainDataSources.importedBy, user.id))
      .where(eq(trainDataSources.importedBy, userId!))
      .orderBy(desc(trainDataSources.createdAt));

    return rows.map((r) => mapSource(r, userId!));
  })
  .get("/:id", async ({ params, userId, set }) => {
    const guard = await verifyTrainSourceOwnership(params.id, userId!);
    if (!guard.ok) {
      set.status = guard.status;
      return { message: guard.message };
    }

    const row = await fetchSourceForUser(params.id, userId!);
    if (!row) {
      set.status = 404;
      return { message: "Train data source not found" };
    }
    return mapSource(row, userId!);
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

        const row = await fetchSourceForUser(result.source_id, userId!);
        if (!row) {
          return {
            ...result,
            imported_by: userId,
          };
        }
        return {
          ...mapSource(row, userId!),
          sheet_manifest: result.sheet_manifest,
        };
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
