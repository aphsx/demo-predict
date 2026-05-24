/**
 * [NEW] Train clean — ETL from train_raw_sheet_* → train_clean_* for model training.
 * Train-only; not used by predict path.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  trainCleanCustomers,
  trainCleanPayments,
  trainCleanUsage,
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
import { TRAIN_IMPORT_BATCH_SIZE } from "./train-excel-contract";
import {
  parseCellDate,
  parseCellDateOnly,
  parseCellInt,
  parseCellNumeric,
  parseCellString,
} from "./train-clean-cell";
import {
  PAYMENT_FIELDS,
  USAGE_SHEET_CHANNEL,
  USAGE_SHEET_NAMES,
  USER_PAYLOAD_TO_COLUMN,
} from "./train-clean-mapping";
import type { TrainPipelineProgressEvent } from "./train-pipeline-progress";
import {
  progressCleanCustomers,
  progressCleanPayments,
  progressCleanStart,
  progressCleanUsageSheet,
  progressPipelineDone,
} from "./train-pipeline-progress";

export interface TrainCleanManifest {
  customers: number;
  payments: number;
  usage: number;
  warnings: string[];
}

const USAGE_RAW_TABLES = {
  "SMS_usage (BC)": trainRawSheetSmsUsageBc,
  "SMS_usage (API)": trainRawSheetSmsUsageApi,
  "SMS_usage (OTP)": trainRawSheetSmsUsageOtp,
  "Email_usage (BC)": trainRawSheetEmailUsageBc,
  "Email_usage (API)": trainRawSheetEmailUsageApi,
  "Email_usage (OTP)": trainRawSheetEmailUsageOtp,
} as const;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function mapUserRow(payload: Record<string, unknown>, sourceId: string) {
  const accId = parseCellInt(payload.acc_id);
  if (accId == null) return null;

  const creditSms = parseCellNumeric(payload["user.credit + user.credit_premium"] ?? payload.credit_sms);
  const creditEmail = parseCellNumeric(payload.credit_email);

  return {
    sourceId,
    accId,
    statusSms: parseCellString(payload["status (SMS)"] ?? payload.status_sms),
    creditSms: creditSms ?? "0",
    creditEmail: creditEmail ?? "0",
    expireSms: parseCellDateOnly(payload.expire),
    expireEmail: parseCellDateOnly(payload.expire_email),
    statusEmail: parseCellString(payload["status (Email)"] ?? payload.status_email),
    joinDate: parseCellDateOnly(payload.join_date),
    lastAccess: parseCellDate(payload.last_access),
    lastSend: parseCellDate(payload.last_send),
  };
}

function mapPaymentRow(payload: Record<string, unknown>, sourceId: string) {
  const accId = parseCellInt(payload.acc_id);
  const paymentDate = parseCellDate(payload.payment_date);
  if (accId == null || !paymentDate) return null;

  const uid = parseCellInt(payload.uid);

  return {
    sourceId,
    accId,
    paymentUid: uid,
    paymentDate,
    amount: parseCellNumeric(payload.amount),
    creditAdd: parseCellNumeric(payload.credit_add),
    creditType: parseCellString(payload.credit_type),
  };
}

function mapUsageRow(
  payload: Record<string, unknown>,
  sourceId: string,
  channel: string,
  usageSource: string
) {
  const accId = parseCellInt(payload.acc_id);
  if (accId == null) return null;

  const usageVal = parseCellNumeric(payload.usage);

  return {
    sourceId,
    accId,
    year: parseCellInt(payload.year),
    month: parseCellInt(payload.month),
    usage: usageVal ?? "0",
    channel,
    usageSource,
  };
}

export async function cleanTrainFromRaw(
  sourceId: string,
  onProgress?: (event: TrainPipelineProgressEvent) => void
): Promise<TrainCleanManifest> {
  const emit = onProgress;
  const warnings: string[] = [];

  await db
    .update(trainDataSources)
    .set({ importStatus: "cleaning", errorMessage: null })
    .where(eq(trainDataSources.id, sourceId));

  emit?.(progressCleanStart());

  await db.delete(trainCleanCustomers).where(eq(trainCleanCustomers.sourceId, sourceId));
  await db.delete(trainCleanPayments).where(eq(trainCleanPayments.sourceId, sourceId));
  await db.delete(trainCleanUsage).where(eq(trainCleanUsage.sourceId, sourceId));

  emit?.(progressCleanCustomers());
  const userRows = await db
    .select({ rowPayload: trainRawSheetUsersUserProfile.rowPayload })
    .from(trainRawSheetUsersUserProfile)
    .where(eq(trainRawSheetUsersUserProfile.sourceId, sourceId));

  const customerValues = [];
  for (const r of userRows) {
    const payload = r.rowPayload as Record<string, unknown>;
    const mapped = mapUserRow(payload, sourceId);
    if (mapped) customerValues.push(mapped);
  }

  let customers = 0;
  for (const batch of chunk(customerValues, TRAIN_IMPORT_BATCH_SIZE)) {
    await db.insert(trainCleanCustomers).values(batch);
    customers += batch.length;
  }

  emit?.(progressCleanPayments());
  const payRows = await db
    .select({ rowPayload: trainRawSheetBackendPayment.rowPayload })
    .from(trainRawSheetBackendPayment)
    .where(eq(trainRawSheetBackendPayment.sourceId, sourceId));

  const paymentValues = [];
  for (const r of payRows) {
    const mapped = mapPaymentRow(r.rowPayload as Record<string, unknown>, sourceId);
    if (mapped) paymentValues.push(mapped);
  }

  let payments = 0;
  for (const batch of chunk(paymentValues, TRAIN_IMPORT_BATCH_SIZE)) {
    await db.insert(trainCleanPayments).values(batch);
    payments += batch.length;
  }

  let usage = 0;
  const usageSheetCount = USAGE_SHEET_NAMES.length;
  for (let i = 0; i < usageSheetCount; i++) {
    const sheetName = USAGE_SHEET_NAMES[i];
    const meta = USAGE_SHEET_CHANNEL[sheetName];
    const table = USAGE_RAW_TABLES[sheetName as keyof typeof USAGE_RAW_TABLES];

    const rawUsage = await db
      .select({ rowPayload: table.rowPayload })
      .from(table)
      .where(eq(table.sourceId, sourceId));

    const usageValues = [];
    for (const r of rawUsage) {
      const mapped = mapUsageRow(
        r.rowPayload as Record<string, unknown>,
        sourceId,
        meta.channel,
        meta.usageSource
      );
      if (mapped) usageValues.push(mapped);
    }

    for (const batch of chunk(usageValues, TRAIN_IMPORT_BATCH_SIZE)) {
      await db.insert(trainCleanUsage).values(batch);
      usage += batch.length;
    }

    emit?.(progressCleanUsageSheet(i, usageSheetCount, sheetName, usageValues.length));
  }

  const manifest: TrainCleanManifest = { customers, payments, usage, warnings };

  await db
    .update(trainDataSources)
    .set({
      importStatus: "ready",
      cleanManifest: manifest,
      cleanedAt: new Date(),
      errorMessage: null,
    })
    .where(eq(trainDataSources.id, sourceId));

  emit?.(progressPipelineDone());

  return manifest;
}
