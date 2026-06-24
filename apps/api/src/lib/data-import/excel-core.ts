/**
 * Shared Excel parsing utilities used by both train-import and predict-import.
 * Pure functions — no DB, no side effects.
 */
import * as XLSX from "xlsx";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "../../db/client";

export type CellJson = string | number | boolean | null | Record<string, unknown>;

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function trimHeader(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

export function cellToJson(value: unknown): CellJson {
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

export function rowIsEmpty(values: unknown[]): boolean {
  for (const v of values) {
    if (v == null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    return false;
  }
  return true;
}

export function buildPayload(headers: (string | null)[], row: unknown[]): Record<string, CellJson> {
  const payload: Record<string, CellJson> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    if (key == null) continue;
    payload[key] = cellToJson(i < row.length ? row[i] : null);
  }
  return payload;
}

export function validateHeaders(sheetName: string, headers: (string | null)[], required: string[]): void {
  const present = new Set(headers.filter((h): h is string => h != null));
  for (const req of required) {
    if (!present.has(req)) {
      throw new Error(
        `Sheet "${sheetName}": missing required header "${req}". Found: ${[...present].sort().join(", ")}`
      );
    }
  }
}

export function validateWorkbookSheets(
  sheetNames: string[],
  sheetConfig: Record<string, unknown>,
  requiredSheets: readonly string[]
): void {
  const expected = new Set(Object.keys(sheetConfig));
  for (const req of requiredSheets) {
    if (!sheetNames.includes(req)) {
      throw new Error(`Missing required sheet: ${req}`);
    }
  }
  // Extra/metadata sheets are silently ignored — only required sheets are processed.
}

export function parseSheetRows(
  workbook: XLSX.WorkBook,
  sheetName: string,
  requiredHeaders: string[],
  skipEmpty: boolean
): { excel_row: number; row_payload: Record<string, CellJson> }[] {
  const ws = workbook.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: false,
  }) as unknown[][];

  if (rows.length === 0) return [];

  const headers = (rows[0] as unknown[]).map(trimHeader);
  validateHeaders(sheetName, headers, requiredHeaders);

  const out: { excel_row: number; row_payload: Record<string, CellJson> }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const excelRow = i + 1;
    const values = rows[i] as unknown[];
    if (skipEmpty && rowIsEmpty(values)) continue;
    out.push({ excel_row: excelRow, row_payload: buildPayload(headers, values) });
  }
  return out;
}

export async function insertSheetRows(
  table: PgTable,
  sourceId: string,
  rows: { excel_row: number; row_payload: Record<string, CellJson> }[],
  batchSize: number
): Promise<number> {
  if (rows.length === 0) return 0;

  let inserted = 0;
  for (const batch of chunk(rows, batchSize)) {
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
