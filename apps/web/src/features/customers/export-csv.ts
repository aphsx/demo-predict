/**
 * Client-side CSV export of prediction outputs matching the current filters.
 * Loops the paginated /outputs endpoint (server caps page_size at 200) up to
 * EXPORT_ROW_CAP rows, then builds a UTF-8 CSV with a BOM so Thai text opens
 * correctly in Excel.
 */

import { fetchRunOutputs, type OutputsQuery, type PredictionOutput } from "@/lib/ml-api";

/** Server-enforced max page size for /prediction-runs/:id/outputs. */
const EXPORT_PAGE_SIZE = 200;

/** Hard cap so a runaway export cannot lock the tab. */
export const EXPORT_ROW_CAP = 20_000;

export interface ExportResult {
  /** Rows actually written to the CSV. */
  rows: number;
  /** Total rows matching the filters server-side. */
  total: number;
  /** True when total exceeded EXPORT_ROW_CAP and the file was truncated. */
  capped: boolean;
}

type CsvValue = string | number | boolean | null | undefined;

const CSV_COLUMNS: ReadonlyArray<{
  header: string;
  value: (row: PredictionOutput) => CsvValue;
}> = [
  { header: "acc_id", value: (r) => r.acc_id },
  { header: "lifecycle_stage", value: (r) => r.lifecycle_stage },
  { header: "sub_stage", value: (r) => r.sub_stage },
  { header: "segment", value: (r) => r.segment },
  { header: "churn_probability", value: (r) => r.churn_probability },
  { header: "churn_risk_level", value: (r) => r.churn_risk_level },
  { header: "predicted_clv_6m", value: (r) => r.predicted_clv_6m },
  { header: "customer_value_tier", value: (r) => r.customer_value_tier },
  { header: "revenue_at_risk", value: (r) => r.revenue_at_risk },
  { header: "credit_urgency_level", value: (r) => r.credit_urgency_level },
  { header: "estimated_days_until_topup", value: (r) => r.estimated_days_until_topup },
  { header: "predicted_credit_usage_30d", value: (r) => r.predicted_credit_usage_30d },
  { header: "predicted_credit_usage_90d", value: (r) => r.predicted_credit_usage_90d },
  { header: "days_since_last_activity", value: (r) => r.days_since_last_activity },
  { header: "n_purchases", value: (r) => r.n_purchases },
  { header: "total_revenue", value: (r) => r.total_revenue },
  { header: "priority_score", value: (r) => r.priority_score },
  { header: "priority_rank", value: (r) => r.priority_rank },
  { header: "ever_paid", value: (r) => r.ever_paid },
  { header: "usage_trend", value: (r) => r.usage_trend },
  { header: "output_status", value: (r) => r.output_status },
];

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(rows: PredictionOutput[]): string {
  const lines: string[] = [CSV_COLUMNS.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((c) => csvCell(c.value(row))).join(","));
  }
  return lines.join("\r\n");
}

/** Fetch every page matching the filters (cap EXPORT_ROW_CAP), newest sort preserved. */
export async function fetchAllOutputsForExport(
  runId: string,
  baseQuery: Omit<OutputsQuery, "page" | "page_size">,
  onProgress?: (loaded: number, total: number) => void
): Promise<{ rows: PredictionOutput[]; total: number }> {
  const rows: PredictionOutput[] = [];
  let total = 0;
  let page = 1;

  for (;;) {
    const result = await fetchRunOutputs(runId, {
      ...baseQuery,
      page,
      page_size: EXPORT_PAGE_SIZE,
    });
    total = result.total;
    rows.push(...result.data);
    onProgress?.(Math.min(rows.length, total), total);
    const done =
      result.data.length === 0 ||
      rows.length >= total ||
      rows.length >= EXPORT_ROW_CAP;
    if (done) break;
    page += 1;
  }

  return { rows: rows.slice(0, EXPORT_ROW_CAP), total };
}

/** Trigger a browser download of the rows as a UTF-8 (BOM) CSV. */
export function downloadCsv(rows: PredictionOutput[], filename: string): void {
  const bom = "\uFEFF"; // UTF-8 BOM so Excel renders Thai text correctly.
  const blob = new Blob([bom + buildCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** One-call export: fetch all filtered rows, build the CSV, download it. */
export async function exportOutputsCsv(
  runId: string,
  baseQuery: Omit<OutputsQuery, "page" | "page_size">,
  onProgress?: (loaded: number, total: number) => void
): Promise<ExportResult> {
  const { rows, total } = await fetchAllOutputsForExport(runId, baseQuery, onProgress);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsv(rows, `prediction-outputs-${runId.slice(0, 8)}-${stamp}.csv`);
  return { rows: rows.length, total, capped: total > EXPORT_ROW_CAP };
}
