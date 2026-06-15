/**
 * [NEW] Predict raw import — faithful row_payload per sheet into predict_* tables.
 * Each upload is a new snapshot (no merge with prior sources). No global checksum dedupe.
 */
import { createHash } from "node:crypto";
import type { PgTable } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "../db/client";
import {
  predictDataSources,
  predictRawSheetBackendPayment,
  predictRawSheetEmailUsageApi,
  predictRawSheetEmailUsageBc,
  predictRawSheetEmailUsageOtp,
  predictRawSheetSmsUsageApi,
  predictRawSheetSmsUsageBc,
  predictRawSheetSmsUsageOtp,
  predictRawSheetUsersUserProfile,
} from "../db/schema";
import {
  PREDICT_IMPORT_BATCH_SIZE,
  PREDICT_REQUIRED_SHEETS,
  PREDICT_SHEET_CONFIG,
  type PredictSheetName,
} from "./predict-excel-contract";
import type { CleanManifest } from "./clean-manifest";
import {
  validateWorkbookSheets as validateWorkbookSheetsCore,
  parseSheetRows as parseSheetRowsCore,
  insertSheetRows as insertSheetRowsCore,
  type CellJson,
} from "./data-import/excel-core";

type RawInsertTable = PgTable;

const PREDICT_RAW_TABLE_BY_NAME: Record<string, RawInsertTable> = {
  predict_raw_sheet_users_user_profile: predictRawSheetUsersUserProfile,
  predict_raw_sheet_backend_payment: predictRawSheetBackendPayment,
  predict_raw_sheet_sms_usage_bc: predictRawSheetSmsUsageBc,
  predict_raw_sheet_sms_usage_api: predictRawSheetSmsUsageApi,
  predict_raw_sheet_sms_usage_otp: predictRawSheetSmsUsageOtp,
  predict_raw_sheet_email_usage_bc: predictRawSheetEmailUsageBc,
  predict_raw_sheet_email_usage_api: predictRawSheetEmailUsageApi,
  predict_raw_sheet_email_usage_otp: predictRawSheetEmailUsageOtp,
};

export interface PredictImportResult {
  source_id: string;
  import_status: string;
  sheet_manifest: Record<string, number>;
  file_checksum_sha256: string;
  clean_manifest?: CleanManifest;
}

function validateWorkbookSheets(sheetNames: string[]): void {
  validateWorkbookSheetsCore(sheetNames, PREDICT_SHEET_CONFIG, PREDICT_REQUIRED_SHEETS);
}

function parseSheetRows(buffer: Buffer, sheetName: PredictSheetName, skipEmpty: boolean) {
  return parseSheetRowsCore(buffer, sheetName, PREDICT_SHEET_CONFIG[sheetName].requiredHeaders, skipEmpty);
}

async function insertSheetRows(
  table: RawInsertTable,
  sourceId: string,
  rows: { excel_row: number; row_payload: Record<string, CellJson> }[]
) {
  return insertSheetRowsCore(table, sourceId, rows, PREDICT_IMPORT_BATCH_SIZE);
}

export async function importPredictExcel(params: {
  buffer: Buffer;
  filename: string;
  name: string;
  imported_by: string;
  client_label?: string | null;
  notes?: string | null;
  /** When true, leave status `importing` after raw (clean step sets `ready`). */
  deferReadyCatalog?: boolean;
}): Promise<PredictImportResult> {
  const checksum = createHash("sha256").update(params.buffer).digest("hex");

  const wb = XLSX.read(params.buffer, { type: "buffer", cellDates: true });
  validateWorkbookSheets(wb.SheetNames);

  const [created] = await db
    .insert(predictDataSources)
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
    .returning({ id: predictDataSources.id });

  const sourceId = created.id;
  const manifest: Record<string, number> = {};

  try {
    const sheetOrder = wb.SheetNames.filter(
      (n): n is PredictSheetName => n in PREDICT_SHEET_CONFIG
    );

    for (const sheetName of sheetOrder) {
      const cfg = PREDICT_SHEET_CONFIG[sheetName];
      const table = PREDICT_RAW_TABLE_BY_NAME[cfg.table];
      if (!table) throw new Error(`No table mapping for ${cfg.table}`);

      const rows = parseSheetRows(params.buffer, sheetName, true);
      manifest[sheetName] = await insertSheetRows(table, sourceId, rows);
    }

    if (params.deferReadyCatalog) {
      await db
        .update(predictDataSources)
        .set({
          importedAt: new Date(),
          sheetManifest: manifest,
        })
        .where(eq(predictDataSources.id, sourceId));
    } else {
      await db
        .update(predictDataSources)
        .set({
          importStatus: "ready",
          importedAt: new Date(),
          sheetManifest: manifest,
        })
        .where(eq(predictDataSources.id, sourceId));
    }

    return {
      source_id: sourceId,
      import_status: params.deferReadyCatalog ? "importing" : "ready",
      sheet_manifest: manifest,
      file_checksum_sha256: checksum,
    };
  } catch (e) {
    await db.delete(predictDataSources).where(eq(predictDataSources.id, sourceId));
    throw e;
  }
}
