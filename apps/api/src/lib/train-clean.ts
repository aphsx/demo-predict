/**
 * [NEW] Train clean — ETL from train_raw_sheet_* → train_clean_* for model training.
 * Parse + lineage only; ML rules (period, labels) stay in Python.
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
import {
  emptySkippedCounts,
  mapPaymentRow,
  mapUsageRow,
  mapUserRow,
  type CleanSkipReason,
  type RawRowInput,
} from "./sheet-cleaners";
import { TRAIN_IMPORT_BATCH_SIZE } from "./train-excel-contract";
import {
  USAGE_SHEET_CHANNEL,
  USAGE_SHEET_NAMES,
} from "./train-clean-mapping";
import type { CleanManifest } from "./clean-manifest";
export type { CleanManifest, CleanSkipped, TrainCleanManifest, TrainCleanSkipped } from "./clean-manifest";
import { abortTrainDataSource } from "./abort-data-source";
import type { TrainPipelineProgressEvent } from "./train-pipeline-progress";
import {
  progressCleanCustomers,
  progressCleanPayments,
  progressCleanStart,
  progressCleanUsageSheet,
  progressPipelineDone,
} from "./train-pipeline-progress";

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

function bumpSkip(skipped: Record<CleanSkipReason, number>, reason: CleanSkipReason): void {
  skipped[reason] += 1;
}

function toRawInput(row: {
  id: number;
  excelRow: number;
  rowPayload: unknown;
}): RawRowInput {
  return {
    excelRow: row.excelRow,
    rawRowId: row.id,
    payload: row.rowPayload as Record<string, unknown>,
  };
}

export async function cleanTrainFromRaw(
  sourceId: string,
  onProgress?: (event: TrainPipelineProgressEvent) => void
): Promise<CleanManifest> {
  const emit = onProgress;

  const [sourceRow] = await db
    .select({ sheetManifest: trainDataSources.sheetManifest })
    .from(trainDataSources)
    .where(eq(trainDataSources.id, sourceId))
    .limit(1);

  const rawManifest =
    (sourceRow?.sheetManifest as Record<string, number> | null) ?? {};

  await db
    .update(trainDataSources)
    .set({ importStatus: "cleaning", errorMessage: null })
    .where(eq(trainDataSources.id, sourceId));

  emit?.(progressCleanStart());

  const skipped = emptySkippedCounts();
  const warnings: string[] = [];
  let customers = 0;
  let payments = 0;
  let usage = 0;

  try {
  await db.transaction(async (tx) => {
    await tx.delete(trainCleanCustomers).where(eq(trainCleanCustomers.sourceId, sourceId));
    await tx.delete(trainCleanPayments).where(eq(trainCleanPayments.sourceId, sourceId));
    await tx.delete(trainCleanUsage).where(eq(trainCleanUsage.sourceId, sourceId));

    emit?.(progressCleanCustomers());
    const userRows = await tx
      .select({
        id: trainRawSheetUsersUserProfile.id,
        excelRow: trainRawSheetUsersUserProfile.excelRow,
        rowPayload: trainRawSheetUsersUserProfile.rowPayload,
      })
      .from(trainRawSheetUsersUserProfile)
      .where(eq(trainRawSheetUsersUserProfile.sourceId, sourceId));

    const customerValues = [];
    for (const r of userRows) {
      const mapped = mapUserRow(toRawInput(r), sourceId);
      if (!mapped.ok) {
        bumpSkip(skipped, mapped.reason);
        continue;
      }
      customerValues.push(mapped.value);
    }

    for (const batch of chunk(customerValues, TRAIN_IMPORT_BATCH_SIZE)) {
      await tx.insert(trainCleanCustomers).values(batch);
      customers += batch.length;
    }

    emit?.(progressCleanPayments());
    const payRows = await tx
      .select({
        id: trainRawSheetBackendPayment.id,
        excelRow: trainRawSheetBackendPayment.excelRow,
        rowPayload: trainRawSheetBackendPayment.rowPayload,
      })
      .from(trainRawSheetBackendPayment)
      .where(eq(trainRawSheetBackendPayment.sourceId, sourceId));

    const paymentValues = [];
    for (const r of payRows) {
      const mapped = mapPaymentRow(toRawInput(r), sourceId);
      if (!mapped.ok) {
        bumpSkip(skipped, mapped.reason);
        continue;
      }
      paymentValues.push(mapped.value);
    }

    for (const batch of chunk(paymentValues, TRAIN_IMPORT_BATCH_SIZE)) {
      await tx.insert(trainCleanPayments).values(batch);
      payments += batch.length;
    }

    const usageSheetCount = USAGE_SHEET_NAMES.length;
    for (let i = 0; i < usageSheetCount; i++) {
      const sheetName = USAGE_SHEET_NAMES[i];
      const meta = USAGE_SHEET_CHANNEL[sheetName];
      const table = USAGE_RAW_TABLES[sheetName as keyof typeof USAGE_RAW_TABLES];

      const rawUsage = await tx
        .select({
          id: table.id,
          excelRow: table.excelRow,
          rowPayload: table.rowPayload,
        })
        .from(table)
        .where(eq(table.sourceId, sourceId));

      const usageValues = [];
      for (const r of rawUsage) {
        const mapped = mapUsageRow(toRawInput(r), sourceId, meta.channel, meta.usageSource);
        if (!mapped.ok) {
          bumpSkip(skipped, mapped.reason);
          continue;
        }
        if (mapped.warnings) warnings.push(...mapped.warnings);
        usageValues.push(mapped.value);
      }

      for (const batch of chunk(usageValues, TRAIN_IMPORT_BATCH_SIZE)) {
        await tx.insert(trainCleanUsage).values(batch);
        usage += batch.length;
      }

      emit?.(progressCleanUsageSheet(i, usageSheetCount, sheetName, usageValues.length));
    }
  });

  const manifest: CleanManifest = {
    raw: rawManifest,
    clean: { customers, payments, usage },
    skipped: {
      customers_no_acc_id: skipped.customers_no_acc_id,
      payments_no_acc_id: skipped.payments_no_acc_id,
      payments_no_date: skipped.payments_no_date,
      usage_no_acc_id: skipped.usage_no_acc_id,
    },
    warnings,
  };

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
  } catch (e) {
    await abortTrainDataSource(sourceId);
    throw e;
  }
}
