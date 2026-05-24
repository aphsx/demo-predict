/**
 * Excel header → clean column mapping (aligned with apps/ml/src/data_loader.py).
 */

import type { TrainSheetName } from "./train-excel-contract";

export const USER_PAYLOAD_TO_COLUMN: Record<string, string> = {
  acc_id: "acc_id",
  "status (SMS)": "status_sms",
  "user.credit + user.credit_premium": "credit_sms",
  credit_email: "credit_email",
  expire: "expire_sms",
  expire_email: "expire_email",
  "status (Email)": "status_email",
  join_date: "join_date",
  last_access: "last_access",
  last_send: "last_send",
};

export const USAGE_SHEET_CHANNEL: Record<string, { channel: string; usageSource: string }> = {
  "SMS_usage (BC)": { channel: "sms", usageSource: "bc" },
  "SMS_usage (API)": { channel: "sms", usageSource: "api" },
  "SMS_usage (OTP)": { channel: "sms", usageSource: "otp" },
  "Email_usage (BC)": { channel: "email", usageSource: "bc" },
  "Email_usage (API)": { channel: "email", usageSource: "api" },
  "Email_usage (OTP)": { channel: "email", usageSource: "otp" },
};

export const USAGE_SHEET_NAMES = Object.keys(USAGE_SHEET_CHANNEL) as TrainSheetName[];

export const PAYMENT_FIELDS = ["uid", "acc_id", "payment_date", "amount", "credit_add", "credit_type"] as const;
