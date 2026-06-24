/**
 * [NEW] Predict raw Excel contract — same 8 sheets as train, different table names.
 * Legacy raw_customers/payments/usage removed (see 004_drop_legacy_raw_tables.sql).
 */
export {
  TRAIN_REQUIRED_SHEETS as PREDICT_REQUIRED_SHEETS,
  TRAIN_OPTIONAL_SHEETS as PREDICT_OPTIONAL_SHEETS,
  TRAIN_ALL_SHEETS as PREDICT_ALL_SHEETS,
  TRAIN_IMPORT_BATCH_SIZE as PREDICT_IMPORT_BATCH_SIZE,
  type TrainSheetName as PredictSheetName,
} from "./train-excel-contract";

import type { TrainSheetName } from "./train-excel-contract";

/** Sheet name → predict raw PostgreSQL table */
export const PREDICT_SHEET_CONFIG: Record<
  TrainSheetName,
  { table: string; requiredHeaders: string[] }
> = {
  "Users+User_profile": {
    table: "predict_raw_sheet_users_user_profile",
    requiredHeaders: ["acc_id"],
  },
  "Backend_payment": {
    table: "predict_raw_sheet_backend_payment",
    requiredHeaders: ["uid", "payment_date", "acc_id", "amount", "credit_add"],
  },
  "SMS_usage (BC)": {
    table: "predict_raw_sheet_sms_usage_bc",
    requiredHeaders: ["year", "month", "acc_id", "usage"],
  },
  "SMS_usage (API)": {
    table: "predict_raw_sheet_sms_usage_api",
    requiredHeaders: ["year", "month", "acc_id", "usage"],
  },
  "SMS_usage (OTP)": {
    table: "predict_raw_sheet_sms_usage_otp",
    requiredHeaders: ["year", "month", "acc_id", "usage"],
  },
  "Email_usage (BC)": {
    table: "predict_raw_sheet_email_usage_bc",
    requiredHeaders: ["year", "month", "acc_id", "usage"],
  },
  "Email_usage (API)": {
    table: "predict_raw_sheet_email_usage_api",
    requiredHeaders: ["year", "month", "acc_id", "usage"],
  },
  "Email_usage (OTP)": {
    table: "predict_raw_sheet_email_usage_otp",
    requiredHeaders: ["year", "month", "acc_id", "usage"],
  },
};
