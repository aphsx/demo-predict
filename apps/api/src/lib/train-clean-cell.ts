/**
 * Parse row_payload cell values into typed DB fields (mirrors apps/ml/src/data_loader.py).
 */

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

export function parseCellString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "object" && value !== null && "_excel" in value) {
    const o = value as { iso?: string; serial?: number };
    if (o.iso) return o.iso;
    if (typeof o.serial === "number") return String(o.serial);
  }
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

export function parseCellInt(value: unknown): number | null {
  const s = parseCellString(value);
  if (s == null) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function parseCellNumeric(value: unknown): string | null {
  const s = parseCellString(value);
  if (s == null) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return String(n);
}

export function parseCellDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === "object" && value !== null && "_excel" in value) {
    const o = value as { iso?: string; serial?: number };
    if (o.iso) {
      const d = new Date(o.iso);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (typeof o.serial === "number" && Number.isFinite(o.serial)) {
      return new Date(EXCEL_EPOCH_MS + o.serial * 86_400_000);
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(EXCEL_EPOCH_MS + value * 86_400_000);
  }
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function parseCellDateOnly(value: unknown): string | null {
  const d = parseCellDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}
