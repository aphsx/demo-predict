/**
 * [NEW] Train raw import logic — faithful row_payload per sheet.
 * Parallel to predict-import.ts and moby-data-prep/scripts/import_train_raw.py.
 */
import { createHash } from "node:crypto";
import type { PgTable } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "../db/client";
import {
  trainDataSources,
  trainRawSheetBackendPayment,
  trainRawSheetEmailUsageApi,
  trainRawSheetEmailUsageBc,
  trainRawSheetEmailUsageOtp,
  trainRawSheetSmsUsageApi,
  trainRawSheetSmsUsageBc,
  trainRawSheetSmsUsageOtp,
  trainRawSheetUsersUserProfile,
} from "../db/schema";
import {
  TRAIN_IMPORT_BATCH_SIZE,
  TRAIN_REQUIRED_SHEETS,
  TRAIN_SHEET_CONFIG,
  type TrainSheetName,
} from "./train-excel-contract";

type CellJson = string | number | boolean | null | Record<string, unknown>;

type TrainRawInsertTable = PgTable;

const TRAIN_RAW_TABLE_BY_NAME: Record<string, TrainRawInsertTable> = {
  train_raw_sheet_users_user_profile: trainRawSheetUsersUserProfile,
  train_raw_sheet_backend_payment: trainRawSheetBackendPayment,
  train_raw_sheet_sms_usage_bc: trainRawSheetSmsUsageBc,
  train_raw_sheet_sms_usage_api: trainRawSheetSmsUsageApi,
  train_raw_sheet_sms_usage_otp: trainRawSheetSmsUsageOtp,
  train_raw_sheet_email_usage_bc: trainRawSheetEmailUsageBc,
  train_raw_sheet_email_usage_api: trainRawSheetEmailUsageApi,
  train_raw_sheet_email_usage_otp: trainRawSheetEmailUsageOtp,
};

export interface TrainImportResult {
  source_id: string;
  import_status: string;
  sheet_manifest: Record<string, number>;
  file_checksum_sha256: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function trimHeader(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function cellToJson(value: unknown): CellJson {
  if (value == null) return null;
  if (value instanceof Date) {
    const serial = (value.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;
    return { _excel: "datetime", iso: value.toISOString(), serial };
  }
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}

function rowIsEmpty(values: unknown[]): boolean {
  for (const v of values) {
    if (v == null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    return false;
  }
  return true;
}

function buildPayload(headers: (string | null)[], row: unknown[]): Record<string, CellJson> {
  const payload: Record<string, CellJson> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    if (key == null) continue;
    payload[key] = cellToJson(i < row.length ? row[i] : null);
  }
  return payload;
}

function validateHeaders(sheetName: string, headers: (string | null)[], required: string[]): void {
  const present = new Set(headers.filter((h): h is string => h != null));
  for (const req of required) {
    if (!present.has(req)) {
      throw new Error(
        `Sheet "${sheetName}": missing required header "${req}". Found: ${[...present].sort().join(", ")}`
      );
    }
  }
}

function parseSheetRows(
  buffer: Buffer,
  sheetName: TrainSheetName,
  skipEmpty: boolean
): { excel_row: number; row_payload: Record<string, CellJson> }[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: false,
  }) as unknown[][];

  if (rows.length === 0) return [];

  const headers = (rows[0] as unknown[]).map(trimHeader);
  validateHeaders(sheetName, headers, TRAIN_SHEET_CONFIG[sheetName].requiredHeaders);

  const out: { excel_row: number; row_payload: Record<string, CellJson> }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const excelRow = i + 1;
    const values = rows[i] as unknown[];
    if (skipEmpty && rowIsEmpty(values)) continue;
    out.push({ excel_row: excelRow, row_payload: buildPayload(headers, values) });
  }
  return out;
}

async function insertSheetRows(
  table: TrainRawInsertTable,
  sourceId: string,
  rows: { excel_row: number; row_payload: Record<string, CellJson> }[]
): Promise<number> {
  if (rows.length === 0) return 0;

  let inserted = 0;
  for (const batch of chunk(rows, TRAIN_IMPORT_BATCH_SIZE)) {
    await db.insert(table).values(
      batch.map((r) => ({
        sourceId,
        excelRow: r.excel_row,
        rowPayload: r.row_payload,
      }))
    );
    inserted += batch.length;
  }
  return inserted;
}

export async function importTrainExcel(params: {
  buffer: Buffer;
  filename: string;
  name: string;
  client_label?: string | null;
  notes?: string | null;
  imported_by: string;
}): Promise<TrainImportResult> {
  const checksum = createHash("sha256").update(params.buffer).digest("hex");

  const wb = XLSX.read(params.buffer, { type: "buffer", cellDates: true });
  for (const req of TRAIN_REQUIRED_SHEETS) {
    if (!wb.SheetNames.includes(req)) {
      throw new Error(`Missing required sheet: ${req}`);
    }
  }

  const existing = await db
    .select({ id: trainDataSources.id })
    .from(trainDataSources)
    .where(eq(trainDataSources.fileChecksumSha256, checksum))
    .limit(1);

  if (existing.length > 0) {
    const err = new Error("This file was already imported (checksum match)") as Error & {
      code: string;
      source_id: string;
    };
    err.code = "DUPLICATE_FILE";
    err.source_id = existing[0].id;
    throw err;
  }

  const [created] = await db
    .insert(trainDataSources)
    .values({
      name: params.name,
      clientLabel: params.client_label ?? null,
      originalFilename: params.filename,
      fileChecksumSha256: checksum,
      fileSizeBytes: params.buffer.length,
      importStatus: "importing",
      importedBy: params.imported_by,
      notes: params.notes ?? null,
    })
    .returning({ id: trainDataSources.id });

  const sourceId = created.id;
  const manifest: Record<string, number> = {};

  try {
    const sheetOrder = wb.SheetNames.filter(
      (n): n is TrainSheetName => n in TRAIN_SHEET_CONFIG
    );

    for (const sheetName of sheetOrder) {
      const cfg = TRAIN_SHEET_CONFIG[sheetName];
      const table = TRAIN_RAW_TABLE_BY_NAME[cfg.table];
      if (!table) throw new Error(`No table mapping for ${cfg.table}`);

      const rows = parseSheetRows(params.buffer, sheetName, true);
      manifest[sheetName] = await insertSheetRows(table, sourceId, rows);
    }

    await db
      .update(trainDataSources)
      .set({
        importStatus: "ready",
        importedAt: new Date(),
        sheetManifest: manifest,
      })
      .where(eq(trainDataSources.id, sourceId));

    return {
      source_id: sourceId,
      import_status: "ready",
      sheet_manifest: manifest,
      file_checksum_sha256: checksum,
    };
  } catch (e) {
    await db.delete(trainDataSources).where(eq(trainDataSources.id, sourceId));
    throw e;
  }
}
