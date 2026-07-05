/**
 * Shared data-source DTO mapping used by both train-data and predict-data routes.
 * The train_data_sources and predict_data_sources tables have identical columns,
 * so the DB-row → API-response shape is the same for both.
 */

/** Raw Drizzle row shape selected by both `train-data` and `predict-data` routes. */
export interface DataSourceRow {
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
}

/** Maps a data-source DB row to the snake_case API response shape. */
export function mapDataSourceRow(row: DataSourceRow) {
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
    // Uniform creator contract (matches prediction/training runs).
    created_by: row.importedBy,
    created_by_name: row.importerName ?? row.importerEmail ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** Whether an uploaded filename is an .xlsx workbook (case-insensitive). */
export function isXlsxFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(".xlsx");
}
