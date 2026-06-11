/**
 * Map raw row_payload → typed clean row shapes (shared contract with excel_schema.yaml).
 */
import {
  parseCellDate,
  parseCellDateOnly,
  parseCellInt,
  parseCellNumeric,
  parseCellString,
} from "./train-clean-cell";
export interface RawRowInput {
  excelRow: number;
  rawRowId: number;
  payload: Record<string, unknown>;
}

export type CleanSkipReason =
  | "customers_no_acc_id"
  | "payments_no_acc_id"
  | "payments_no_date"
  | "usage_no_acc_id";

export type MapResult<T> =
  | { ok: true; value: T; warnings?: string[] }
  | { ok: false; reason: CleanSkipReason };

export function emptySkippedCounts(): Record<CleanSkipReason, number> {
  return {
    customers_no_acc_id: 0,
    payments_no_acc_id: 0,
    payments_no_date: 0,
    usage_no_acc_id: 0,
  };
}

function payloadString(payload: Record<string, unknown>, excelKey: string): string | null {
  return parseCellString(payload[excelKey]);
}

function payloadNumericDefaultZero(
  payload: Record<string, unknown>,
  excelKey: string
): string {
  return parseCellNumeric(payload[excelKey]) ?? "0";
}

export function mapUserRow(
  raw: RawRowInput,
  sourceId: string
): MapResult<{
  sourceId: string;
  rawRowId: number;
  excelRow: number;
  accId: number;
  statusSms: string | null;
  creditSms: string;
  creditEmail: string;
  expireSms: string | null;
  expireEmail: string | null;
  statusEmail: string | null;
  joinDate: string | null;
  lastAccess: Date | null;
  lastSend: Date | null;
}> {
  const accId = parseCellInt(raw.payload.acc_id);
  if (accId == null) {
    return { ok: false, reason: "customers_no_acc_id" };
  }

  const creditSmsKey = "user.credit + user.credit_premium";
  const creditSms =
    parseCellNumeric(raw.payload[creditSmsKey] ?? raw.payload.credit_sms) ?? "0";
  const creditEmail = parseCellNumeric(raw.payload.credit_email) ?? "0";

  const row = {
    sourceId,
    rawRowId: raw.rawRowId,
    excelRow: raw.excelRow,
    accId,
    statusSms: payloadString(raw.payload, "status (SMS)") ?? payloadString(raw.payload, "status_sms"),
    creditSms,
    creditEmail,
    expireSms: parseCellDateOnly(raw.payload.expire),
    expireEmail: parseCellDateOnly(raw.payload.expire_email),
    statusEmail:
      payloadString(raw.payload, "status (Email)") ?? payloadString(raw.payload, "status_email"),
    joinDate: parseCellDateOnly(raw.payload.join_date),
    lastAccess: parseCellDate(raw.payload.last_access),
    lastSend: parseCellDate(raw.payload.last_send),
  };

  return { ok: true, value: row };
}

export function mapPaymentRow(
  raw: RawRowInput,
  sourceId: string
): MapResult<{
  sourceId: string;
  rawRowId: number;
  excelRow: number;
  accId: number;
  paymentUid: number | null;
  paymentDate: Date;
  amount: string | null;
  creditAdd: string | null;
  creditType: string | null;
}> {
  const accId = parseCellInt(raw.payload.acc_id);
  if (accId == null) {
    return { ok: false, reason: "payments_no_acc_id" };
  }

  const paymentDate = parseCellDate(raw.payload.payment_date);
  if (!paymentDate) {
    return { ok: false, reason: "payments_no_date" };
  }

  return {
    ok: true,
    value: {
      sourceId,
      rawRowId: raw.rawRowId,
      excelRow: raw.excelRow,
      accId,
      paymentUid: parseCellInt(raw.payload.uid),
      paymentDate,
      amount: parseCellNumeric(raw.payload.amount),
      creditAdd: parseCellNumeric(raw.payload.credit_add),
      creditType: parseCellString(raw.payload.credit_type),
    },
  };
}

export function mapUsageRow(
  raw: RawRowInput,
  sourceId: string,
  channel: string,
  usageSource: string
): MapResult<{
  sourceId: string;
  rawRowId: number;
  excelRow: number;
  accId: number;
  year: number | null;
  month: number | null;
  usage: string;
  channel: string;
  usageSource: string;
}> {
  const accId = parseCellInt(raw.payload.acc_id);
  if (accId == null) {
    return { ok: false, reason: "usage_no_acc_id" };
  }

  const year = parseCellInt(raw.payload.year);
  const month = parseCellInt(raw.payload.month);
  const warnings: string[] = [];
  if (month != null && (month < 1 || month > 12)) {
    warnings.push(`usage month out of range (${month}) at excel_row ${raw.excelRow}`);
  }

  return {
    ok: true,
    value: {
      sourceId,
      rawRowId: raw.rawRowId,
      excelRow: raw.excelRow,
      accId,
      year,
      month,
      usage: parseCellNumeric(raw.payload.usage) ?? "0",
      channel,
      usageSource,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
