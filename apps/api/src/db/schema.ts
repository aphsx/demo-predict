/**
 * Drizzle schema introspected from Alembic migrations:
 *   0001_baseline.py  — all ML + better-auth tables
 *   0002_add_user_id_to_runs.py — user_id FK on prediction_runs
 *
 * DO NOT run drizzle-kit generate or push — Alembic owns the migrations.
 * This file is for the query builder only.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  bigserial,
  numeric,
  boolean,
  date,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Better Auth tables (camelCase column names — created with quoted identifiers by Alembic) ──

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().default(sql`NOW()`),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().default(sql`NOW()`),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [
    index("idx_session_user").on(t.userId),
    index("idx_session_token").on(t.token),
  ]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().default(sql`NOW()`),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [
    index("idx_account_user").on(t.userId),
    uniqueIndex("account_provider_accountid_idx").on(t.providerId, t.accountId),
  ]
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().default(sql`NOW()`),
});

// ── [LEGACY] ML output tables (raw_customers/payments/usage removed — see 004_drop_*) ──
// See docs/DATA-PIPELINE-MIGRATION.md

export const modelVersions = pgTable(
  "model_versions",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    modelType: text("model_type").notNull(),
    version: text("version").notNull(),
    trainedAt: timestamp("trained_at", { withTimezone: true }).default(sql`NOW()`),
    metricsJson: jsonb("metrics_json"),
    modelFilePath: text("model_file_path"),
    isActive: boolean("is_active").default(false),
  },
  (t) => [
    uniqueIndex("mv_type_version_idx").on(t.modelType, t.version),
  ]
);

export const predictionRuns = pgTable(
  "prediction_runs",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    name: text("name").notNull(),
    status: text("status").notNull().default("pending"),
    cutoffDate: date("cutoff_date").notNull(),
    totalCustomers: integer("total_customers"),
    activeCustomers: integer("active_customers"),
    errorMessage: text("error_message"),
    modelVersionId: uuid("model_version_id").references(() => modelVersions.id),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    // Date range of the uploaded data — populated by upload handler from min/max payment_date
    dataStartDate: date("data_start_date"),
    dataEndDate: date("data_end_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`NOW()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`NOW()`),
  },
  (t) => [
    index("idx_runs_user_id").on(t.userId),
  ]
);

export const predictions = pgTable(
  "predictions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id").references(() => predictionRuns.id, { onDelete: "cascade" }),
    accId: integer("acc_id").notNull(),
    lifecycleStage: text("lifecycle_stage"),
    subStage: text("sub_stage"),
    churnProbability: numeric("churn_probability", { precision: 5, scale: 4 }),
    predictedClv6m: numeric("predicted_clv_6m", { precision: 14, scale: 2 }),
    clvCi95Lo: numeric("clv_ci95_lo", { precision: 14, scale: 2 }),
    clvCi95Hi: numeric("clv_ci95_hi", { precision: 14, scale: 2 }),
    clvCi80Lo: numeric("clv_ci80_lo", { precision: 14, scale: 2 }),
    clvCi80Hi: numeric("clv_ci80_hi", { precision: 14, scale: 2 }),
    pAlive: numeric("p_alive", { precision: 5, scale: 4 }),
    creditP10: numeric("credit_p10", { precision: 8, scale: 2 }),
    creditP25: numeric("credit_p25", { precision: 8, scale: 2 }),
    creditP50: numeric("credit_p50", { precision: 8, scale: 2 }),
    creditP75: numeric("credit_p75", { precision: 8, scale: 2 }),
    creditP90: numeric("credit_p90", { precision: 8, scale: 2 }),
    nPurchases: integer("n_purchases"),
    forecastConfidence: numeric("forecast_confidence", { precision: 4, scale: 2 }),
    comebackProbability: numeric("comeback_probability", { precision: 5, scale: 4 }),
    conversionProbability: numeric("conversion_probability", { precision: 5, scale: 4 }),
    isActive: integer("is_active"),
    totalRevenue: numeric("total_revenue", { precision: 14, scale: 2 }),
    daysSinceLastActivity: integer("days_since_last_activity"),
    everPaid: boolean("ever_paid").default(false),
    revenueAtRisk: numeric("revenue_at_risk", { precision: 14, scale: 2 }),
    avgTransactionValue: numeric("avg_transaction_value", { precision: 14, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`NOW()`),
  },
  (t) => [
    index("idx_pred_run").on(t.runId),
    index("idx_pred_acc").on(t.accId),
    index("idx_pred_lifecycle").on(t.lifecycleStage),
  ]
);

export const explanations = pgTable(
  "explanations",
  {
    id:        uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    runId:     uuid("run_id").notNull().references(() => predictionRuns.id, { onDelete: "cascade" }),
    content:   text("content").notNull(),
    model:     text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`NOW()`),
  },
  (t) => [index("idx_explanations_run_id").on(t.runId)]
);

// ── [NEW] Train raw data — greenfield (moby-data-prep migrations) ─────────────
// 8 sheet tables + catalog. NOT prediction_runs. Migrations: moby-data-prep/migrations/
// Future: predict_raw_sheet_*, train_clean_*, predict_clean_*

export const trainDataSources = pgTable(
  "train_data_sources",
  {
    id:                   uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    name:                 text("name").notNull(),
    clientLabel:          text("client_label"),
    originalFilename:     text("original_filename").notNull(),
    fileChecksumSha256: text("file_checksum_sha256").notNull().unique(),
    fileSizeBytes:        bigint("file_size_bytes", { mode: "number" }),
    importStatus:         text("import_status").notNull().default("pending"),
    importedAt:           timestamp("imported_at", { withTimezone: true }),
    sheetManifest:        jsonb("sheet_manifest"),
    cleanManifest:        jsonb("clean_manifest"),
    cleanedAt:            timestamp("cleaned_at", { withTimezone: true }),
    notes:                text("notes"),
    errorMessage:         text("error_message"),
    importedBy:           text("imported_by").references(() => user.id, { onDelete: "set null" }),
    createdAt:            timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [
    index("idx_train_data_sources_status").on(t.importStatus),
    index("idx_train_data_sources_client").on(t.clientLabel),
    index("idx_train_data_sources_imported_by").on(t.importedBy),
  ]
);

function trainRawSheet(tableName: string) {
  return pgTable(
    tableName,
    {
      id:          bigserial("id", { mode: "number" }).primaryKey(),
      sourceId:    uuid("source_id")
        .notNull()
        .references(() => trainDataSources.id, { onDelete: "cascade" }),
      excelRow:    integer("excel_row").notNull(),
      rowPayload:  jsonb("row_payload").notNull(),
      importedAt:  timestamp("imported_at", { withTimezone: true }).notNull().default(sql`NOW()`),
    },
    (t) => [index(`idx_${tableName}_source`).on(t.sourceId)]
  );
}

export const trainRawSheetUsersUserProfile = trainRawSheet("train_raw_sheet_users_user_profile");
export const trainRawSheetBackendPayment = trainRawSheet("train_raw_sheet_backend_payment");
export const trainRawSheetSmsUsageBc = trainRawSheet("train_raw_sheet_sms_usage_bc");
export const trainRawSheetSmsUsageApi = trainRawSheet("train_raw_sheet_sms_usage_api");
export const trainRawSheetSmsUsageOtp = trainRawSheet("train_raw_sheet_sms_usage_otp");
export const trainRawSheetEmailUsageBc = trainRawSheet("train_raw_sheet_email_usage_bc");
export const trainRawSheetEmailUsageApi = trainRawSheet("train_raw_sheet_email_usage_api");
export const trainRawSheetEmailUsageOtp = trainRawSheet("train_raw_sheet_email_usage_otp");

// ── [NEW] Train clean — typed rows for model training (moby-data-prep/migrations/005_*) ──

export const trainCleanCustomers = pgTable(
  "train_clean_customers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => trainDataSources.id, { onDelete: "cascade" }),
    rawRowId: bigint("raw_row_id", { mode: "number" }).notNull(),
    excelRow: integer("excel_row").notNull(),
    accId: integer("acc_id").notNull(),
    statusSms: text("status_sms"),
    creditSms: numeric("credit_sms"),
    creditEmail: numeric("credit_email"),
    expireSms: date("expire_sms"),
    expireEmail: date("expire_email"),
    statusEmail: text("status_email"),
    joinDate: date("join_date"),
    lastAccess: timestamp("last_access", { withTimezone: true }),
    lastSend: timestamp("last_send", { withTimezone: true }),
  },
  (t) => [
    index("idx_train_clean_customers_source").on(t.sourceId),
    index("idx_train_clean_customers_acc").on(t.sourceId, t.accId),
  ]
);

export const trainCleanPayments = pgTable(
  "train_clean_payments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => trainDataSources.id, { onDelete: "cascade" }),
    rawRowId: bigint("raw_row_id", { mode: "number" }).notNull(),
    excelRow: integer("excel_row").notNull(),
    accId: integer("acc_id").notNull(),
    paymentUid: bigint("payment_uid", { mode: "number" }),
    paymentDate: timestamp("payment_date", { withTimezone: true }).notNull(),
    amount: numeric("amount"),
    creditAdd: numeric("credit_add"),
    creditType: text("credit_type"),
  },
  (t) => [
    index("idx_train_clean_payments_source").on(t.sourceId),
    index("idx_train_clean_payments_acc").on(t.sourceId, t.accId),
  ]
);

export const trainCleanUsage = pgTable(
  "train_clean_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => trainDataSources.id, { onDelete: "cascade" }),
    rawRowId: bigint("raw_row_id", { mode: "number" }).notNull(),
    excelRow: integer("excel_row").notNull(),
    accId: integer("acc_id").notNull(),
    year: integer("year"),
    month: integer("month"),
    usage: numeric("usage"),
    channel: text("channel").notNull(),
    usageSource: text("usage_source").notNull(),
  },
  (t) => [
    index("idx_train_clean_usage_source").on(t.sourceId),
    index("idx_train_clean_usage_acc").on(t.sourceId, t.accId),
  ]
);

// ── [NEW] Predict raw data — greenfield (moby-data-prep/migrations/003_*) ─────
// NOT train_* or [LEGACY] raw_*. prediction_run_id bridges to runs UI until legacy is removed.

export const predictDataSources = pgTable(
  "predict_data_sources",
  {
    id:                   uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    name:                 text("name").notNull(),
    clientLabel:          text("client_label"),
    originalFilename:     text("original_filename").notNull(),
    fileChecksumSha256:   text("file_checksum_sha256").notNull(),
    fileSizeBytes:        bigint("file_size_bytes", { mode: "number" }),
    importStatus:         text("import_status").notNull().default("pending"),
    importedAt:           timestamp("imported_at", { withTimezone: true }),
    sheetManifest:        jsonb("sheet_manifest"),
    notes:                text("notes"),
    errorMessage:         text("error_message"),
    importedBy:           text("imported_by").references(() => user.id, { onDelete: "set null" }),
    predictionRunId:      uuid("prediction_run_id").references(() => predictionRuns.id, {
      onDelete: "set null",
    }),
    createdAt:            timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [
    index("idx_predict_data_sources_status").on(t.importStatus),
    index("idx_predict_data_sources_client").on(t.clientLabel),
    index("idx_predict_data_sources_imported_by").on(t.importedBy),
    index("idx_predict_data_sources_run").on(t.predictionRunId),
  ]
);

function predictRawSheet(tableName: string) {
  return pgTable(
    tableName,
    {
      id:         bigserial("id", { mode: "number" }).primaryKey(),
      sourceId:   uuid("source_id")
        .notNull()
        .references(() => predictDataSources.id, { onDelete: "cascade" }),
      excelRow:   integer("excel_row").notNull(),
      rowPayload: jsonb("row_payload").notNull(),
      importedAt: timestamp("imported_at", { withTimezone: true }).notNull().default(sql`NOW()`),
    },
    (t) => [index(`idx_${tableName}_source`).on(t.sourceId)]
  );
}

export const predictRawSheetUsersUserProfile = predictRawSheet(
  "predict_raw_sheet_users_user_profile"
);
export const predictRawSheetBackendPayment = predictRawSheet("predict_raw_sheet_backend_payment");
export const predictRawSheetSmsUsageBc = predictRawSheet("predict_raw_sheet_sms_usage_bc");
export const predictRawSheetSmsUsageApi = predictRawSheet("predict_raw_sheet_sms_usage_api");
export const predictRawSheetSmsUsageOtp = predictRawSheet("predict_raw_sheet_sms_usage_otp");
export const predictRawSheetEmailUsageBc = predictRawSheet("predict_raw_sheet_email_usage_bc");
export const predictRawSheetEmailUsageApi = predictRawSheet("predict_raw_sheet_email_usage_api");
export const predictRawSheetEmailUsageOtp = predictRawSheet("predict_raw_sheet_email_usage_otp");

// ── Convenience type exports ───────────────────────────────────────────────────

export type User         = typeof user.$inferSelect;
export type Session      = typeof session.$inferSelect;
export type ModelVersion = typeof modelVersions.$inferSelect;
export type PredictionRun = typeof predictionRuns.$inferSelect;
export type Prediction   = typeof predictions.$inferSelect;
export type Explanation  = typeof explanations.$inferSelect;
