/**
 * [NEW] Train raw Excel contract — mirrors moby-data-prep/config/excel_schema.yaml.
 * [LEGACY] predict upload uses inline constants in routes/uploads.ts (different storage).
 */

export const TRAIN_REQUIRED_SHEETS = ["Users+User_profile", "Backend_payment"] as const;

export const TRAIN_OPTIONAL_SHEETS = [
  "SMS_usage (BC)",
  "SMS_usage (API)",
  "SMS_usage (OTP)",
  "Email_usage (BC)",
  "Email_usage (API)",
  "Email_usage (OTP)",
] as const;

export const TRAIN_ALL_SHEETS = [...TRAIN_REQUIRED_SHEETS, ...TRAIN_OPTIONAL_SHEETS] as const;

export type TrainSheetName = (typeof TRAIN_ALL_SHEETS)[number];

export interface TrainSheetConfig {
  table: string;
  requiredHeaders: string[];
}

export const TRAIN_SHEET_CONFIG: Record<TrainSheetName, TrainSheetConfig> = {
  "Users+User_profile": {
    table: "train_raw_sheet_users_user_profile",
    requiredHeaders: ["acc_id"],
  },
  "Backend_payment": {
    table: "train_raw_sheet_backend_payment",
    requiredHeaders: ["uid", "payment_date", "acc_id"],
  },
  "SMS_usage (BC)": {
    table: "train_raw_sheet_sms_usage_bc",
    requiredHeaders: ["year", "month", "acc_id", "usage"],
  },
  "SMS_usage (API)": {
    table: "train_raw_sheet_sms_usage_api",
    requiredHeaders: ["year", "month", "acc_id", "usage"],
  },
  "SMS_usage (OTP)": {
    table: "train_raw_sheet_sms_usage_otp",
    requiredHeaders: ["year", "month", "acc_id", "usage"],
  },
  "Email_usage (BC)": {
    table: "train_raw_sheet_email_usage_bc",
    requiredHeaders: ["year", "month", "acc_id", "usage"],
  },
  "Email_usage (API)": {
    table: "train_raw_sheet_email_usage_api",
    requiredHeaders: ["year", "month", "acc_id", "usage"],
  },
  "Email_usage (OTP)": {
    table: "train_raw_sheet_email_usage_otp",
    requiredHeaders: ["year", "month", "acc_id", "usage"],
  },
};

export const TRAIN_IMPORT_BATCH_SIZE = 500;
