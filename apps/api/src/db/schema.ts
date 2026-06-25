/**
 * Drizzle schema reflects the single PostgreSQL bootstrap:
 *   db/init/001_schema.sql creates auth, train/predict, and ml_* tables.
 *
 * DO NOT run drizzle-kit generate or push — edit the bootstrap schema deliberately.
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

// ── Better Auth tables (camelCase column names — created with quoted identifiers) ──

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  givenName: text("givenName"),
  familyName: text("familyName"),
  locale: text("locale"),
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

// ── ML output/runtime tables now live in the ml_* schema below. ───────────────
// Auth and train/predict import-clean tables stay intact.

// ── Train raw data — 8 fixed Excel sheet tables + catalog ─────────────────────

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

// ── Train clean — typed rows for model training ───────────────────────────────

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

// ── Predict raw data — independent prediction upload source ───────────────────

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
    cleanManifest:        jsonb("clean_manifest"),
    cleanedAt:            timestamp("cleaned_at", { withTimezone: true }),
    notes:                text("notes"),
    errorMessage:         text("error_message"),
    importedBy:           text("imported_by").references(() => user.id, { onDelete: "set null" }),
    createdAt:            timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [
    index("idx_predict_data_sources_status").on(t.importStatus),
    index("idx_predict_data_sources_client").on(t.clientLabel),
    index("idx_predict_data_sources_imported_by").on(t.importedBy),
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

// ── Predict clean — typed rows for prediction runs ────────────────────────────

export const predictCleanCustomers = pgTable(
  "predict_clean_customers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => predictDataSources.id, { onDelete: "cascade" }),
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
    index("idx_predict_clean_customers_source").on(t.sourceId),
    index("idx_predict_clean_customers_acc").on(t.sourceId, t.accId),
  ]
);

export const predictCleanPayments = pgTable(
  "predict_clean_payments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => predictDataSources.id, { onDelete: "cascade" }),
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
    index("idx_predict_clean_payments_source").on(t.sourceId),
    index("idx_predict_clean_payments_acc").on(t.sourceId, t.accId),
  ]
);

export const predictCleanUsage = pgTable(
  "predict_clean_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => predictDataSources.id, { onDelete: "cascade" }),
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
    index("idx_predict_clean_usage_source").on(t.sourceId),
    index("idx_predict_clean_usage_acc").on(t.sourceId, t.accId),
  ]
);

// ── [NEW] ML v2 — training, model registry, evaluation, prediction outputs ──

export const mlTrainingRuns = pgTable(
  "ml_training_runs",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    sourceId: uuid("source_id").notNull(),
    runType: text("run_type").notNull().default("initial_train"),
    status: text("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    cutoffDate: date("cutoff_date").notNull(),
    horizonDays: integer("horizon_days").notNull(),
    trainingConfigJson: jsonb("training_config_json"),
    progressJson: jsonb("progress_json"),
    resultsJson: jsonb("results_json"),
    parentTrainingRunId: uuid("parent_training_run_id"),
    notes: text("notes"),
    errorMessage: text("error_message"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [
    index("idx_ml_training_runs_source").on(t.sourceId),
    index("idx_ml_training_runs_status").on(t.status),
    index("idx_ml_training_runs_created_by").on(t.createdBy),
  ]
);

export const mlFeatureSets = pgTable(
  "ml_feature_sets",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    name: text("name").notNull(),
    version: text("version").notNull(),
    modelType: text("model_type").notNull(),
    featureNamesJson: jsonb("feature_names_json").notNull(),
    featureSchemaJson: jsonb("feature_schema_json").notNull(),
    transformConfigJson: jsonb("transform_config_json"),
    featureCodeHash: text("feature_code_hash"),
    status: text("status").notNull().default("candidate"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [
    uniqueIndex("uq_ml_feature_sets_name_version_type").on(t.name, t.version, t.modelType),
    index("idx_ml_feature_sets_model_type").on(t.modelType),
    index("idx_ml_feature_sets_status").on(t.status),
  ]
);

export const mlModelVersions = pgTable(
  "ml_model_versions",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    trainingRunId: uuid("training_run_id").notNull().references(() => mlTrainingRuns.id, {
      onDelete: "cascade",
    }),
    featureSetId: uuid("feature_set_id").references(() => mlFeatureSets.id, {
      onDelete: "set null",
    }),
    modelType: text("model_type").notNull(),
    version: text("version").notNull(),
    status: text("status").notNull().default("candidate"),
    artifactPath: text("artifact_path"),
    artifactChecksum: text("artifact_checksum"),
    metricsJson: jsonb("metrics_json"),
    validationMetricsJson: jsonb("validation_metrics_json"),
    testMetricsJson: jsonb("test_metrics_json"),
    featureNamesJson: jsonb("feature_names_json"),
    labelDefinitionJson: jsonb("label_definition_json"),
    trainingDataSnapshotJson: jsonb("training_data_snapshot_json"),
    modelCardJson: jsonb("model_card_json"),
    modelCardPath: text("model_card_path"),
    isActive: boolean("is_active").notNull().default(false),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    trainedAt: timestamp("trained_at", { withTimezone: true }).default(sql`NOW()`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [
    uniqueIndex("uq_ml_model_versions_type_version").on(t.modelType, t.version),
    index("idx_ml_model_versions_training_run").on(t.trainingRunId),
    index("idx_ml_model_versions_feature_set").on(t.featureSetId),
    index("idx_ml_model_versions_type_status").on(t.modelType, t.status),
    index("idx_ml_model_versions_active").on(t.modelType, t.isActive),
    uniqueIndex("uq_ml_model_versions_one_active_per_type")
      .on(t.modelType)
      .where(sql`${t.isActive} = TRUE`),
  ]
);

export const mlModelAliases = pgTable(
  "ml_model_aliases",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    modelType: text("model_type").notNull(),
    alias: text("alias").notNull(),
    modelVersionId: uuid("model_version_id").notNull().references(() => mlModelVersions.id, {
      onDelete: "cascade",
    }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [
    uniqueIndex("uq_ml_model_aliases_type_alias").on(t.modelType, t.alias),
    index("idx_ml_model_aliases_version").on(t.modelVersionId),
  ]
);

export const mlModelActivationHistory = pgTable(
  "ml_model_activation_history",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    modelType: text("model_type").notNull(),
    previousModelVersionId: uuid("previous_model_version_id").references(() => mlModelVersions.id, {
      onDelete: "set null",
    }),
    newModelVersionId: uuid("new_model_version_id").references(() => mlModelVersions.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    reason: text("reason"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [
    index("idx_ml_activation_history_type").on(t.modelType),
    index("idx_ml_activation_history_new_version").on(t.newModelVersionId),
  ]
);

export const mlPredictionRuns = pgTable(
  "ml_prediction_runs",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    predictSourceId: uuid("predict_source_id").notNull(),
    name: text("name").notNull().default("Prediction run"),
    status: text("status").notNull().default("pending"),
    progressJson: jsonb("progress_json"),
    modelVersionsJson: jsonb("model_versions_json"),
    cohortInsightJson: jsonb("cohort_insight_json"),
    cutoffDate: date("cutoff_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    totalCustomers: integer("total_customers"),
    errorMessage: text("error_message"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [
    index("idx_ml_prediction_runs_source").on(t.predictSourceId),
    index("idx_ml_prediction_runs_status").on(t.status),
    index("idx_ml_prediction_runs_created_by").on(t.createdBy),
  ]
);

export const mlDataValidationReports = pgTable(
  "ml_data_validation_reports",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    sourceId: uuid("source_id"),
    sourceKind: text("source_kind").notNull(),
    trainingRunId: uuid("training_run_id").references(() => mlTrainingRuns.id, {
      onDelete: "cascade",
    }),
    predictionRunId: uuid("prediction_run_id").references(() => mlPredictionRuns.id, {
      onDelete: "cascade",
    }),
    validationType: text("validation_type").notNull(),
    status: text("status").notNull(),
    rowCount: integer("row_count"),
    statsJson: jsonb("stats_json"),
    anomaliesJson: jsonb("anomalies_json"),
    driftJson: jsonb("drift_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [
    index("idx_ml_validation_reports_source").on(t.sourceKind, t.sourceId),
    index("idx_ml_validation_reports_training").on(t.trainingRunId),
    index("idx_ml_validation_reports_prediction").on(t.predictionRunId),
    index("idx_ml_validation_reports_status").on(t.status),
  ]
);

export const mlModelEvaluations = pgTable(
  "ml_model_evaluations",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    modelVersionId: uuid("model_version_id").notNull().references(() => mlModelVersions.id, {
      onDelete: "cascade",
    }),
    trainingRunId: uuid("training_run_id").notNull().references(() => mlTrainingRuns.id, {
      onDelete: "cascade",
    }),
    modelType: text("model_type").notNull(),
    evaluationType: text("evaluation_type").notNull(),
    datasetSplit: text("dataset_split").notNull(),
    cutoffDate: date("cutoff_date"),
    horizonDays: integer("horizon_days"),
    baselineName: text("baseline_name"),
    featureSetId: uuid("feature_set_id").references(() => mlFeatureSets.id, {
      onDelete: "set null",
    }),
    metricsJson: jsonb("metrics_json"),
    confusionMatrixJson: jsonb("confusion_matrix_json"),
    calibrationJson: jsonb("calibration_json"),
    liftTableJson: jsonb("lift_table_json"),
    featureImportanceJson: jsonb("feature_importance_json"),
    errorAnalysisJson: jsonb("error_analysis_json"),
    businessMetricsJson: jsonb("business_metrics_json"),
    artifactPath: text("artifact_path"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [
    index("idx_ml_evaluations_model_version").on(t.modelVersionId),
    index("idx_ml_evaluations_training_run").on(t.trainingRunId),
    index("idx_ml_evaluations_type_split").on(t.modelType, t.evaluationType, t.datasetSplit),
  ]
);

export const mlPredictionOutputs = pgTable(
  "ml_prediction_outputs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    predictionRunId: uuid("prediction_run_id").notNull().references(() => mlPredictionRuns.id, {
      onDelete: "cascade",
    }),
    accId: integer("acc_id").notNull(),
    lifecycleStage: text("lifecycle_stage"),
    subStage: text("sub_stage"),
    churnProbability: numeric("churn_probability", { precision: 5, scale: 4 }),
    churnRiskLevel: text("churn_risk_level"),
    predictedClv6m: numeric("predicted_clv_6m", { precision: 14, scale: 2 }),
    customerValueTier: text("customer_value_tier"),
    revenueAtRisk: numeric("revenue_at_risk", { precision: 14, scale: 2 }),
    predictedCreditUsage30d: numeric("predicted_credit_usage_30d", { precision: 14, scale: 2 }),
    predictedCreditUsage90d: numeric("predicted_credit_usage_90d", { precision: 14, scale: 2 }),
    estimatedDaysUntilTopup: integer("estimated_days_until_topup"),
    creditUrgencyLevel: text("credit_urgency_level"),
    usageTrend: text("usage_trend"),
    daysSinceLastActivity: integer("days_since_last_activity"),
    nPurchases: integer("n_purchases"),
    totalRevenue: numeric("total_revenue", { precision: 14, scale: 2 }),
    avgTransactionValue: numeric("avg_transaction_value", { precision: 14, scale: 2 }),
    everPaid: boolean("ever_paid").notNull().default(false),
    priorityScore: numeric("priority_score", { precision: 5, scale: 2 }),
    segment: text("segment"),
    priorityRank: integer("priority_rank"),
    needsReview: boolean("needs_review").notNull().default(false),
    aiExplanation: text("ai_explanation"),
    aiReasoningJson: jsonb("ai_reasoning_json"),
    aiGeneratedAt: timestamp("ai_generated_at", { withTimezone: true }),
    aiModel: text("ai_model"),
    aiStatus: text("ai_status").notNull().default("not_requested"),
    outputStatus: text("output_status").notNull().default("predicted"),
    outputNotes: text("output_notes"),
    modelEligibilityJson: jsonb("model_eligibility_json"),
    modelVersionsJson: jsonb("model_versions_json"),
    churnFactorsJson: jsonb("churn_factors_json"),
    pAlive: numeric("p_alive", { precision: 5, scale: 4 }),
    profileSnapshotJson: jsonb("profile_snapshot_json"),
    creditForecastIntervalJson: jsonb("credit_forecast_interval_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [
    uniqueIndex("uq_ml_prediction_outputs_run_acc").on(t.predictionRunId, t.accId),
    index("idx_ml_prediction_outputs_run").on(t.predictionRunId),
    index("idx_ml_prediction_outputs_acc").on(t.accId),
    index("idx_ml_prediction_outputs_lifecycle").on(t.lifecycleStage),
    index("idx_ml_prediction_outputs_churn").on(t.churnRiskLevel),
    index("idx_ml_prediction_outputs_priority").on(t.priorityScore),
    index("idx_ml_prediction_outputs_segment").on(t.segment),
    index("idx_ml_prediction_outputs_value_tier").on(t.customerValueTier),
    index("idx_ml_prediction_outputs_urgency").on(t.creditUrgencyLevel),
    index("idx_ml_prediction_outputs_needs_review").on(t.needsReview),
  ]
);

// ── AI Chat v2 (reflects db/init/001_schema.sql) ──────────────────────────────
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => mlPredictionRuns.id, { onDelete: "set null" }),
    title: text("title").notNull().default("New chat"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [index("ai_conversations_user_idx").on(t.userId, t.updatedAt)]
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    evidenceJson: jsonb("evidence_json"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  },
  (t) => [index("ai_messages_conv_idx").on(t.conversationId, t.id)]
);

// ── Convenience type exports ───────────────────────────────────────────────────

export type User         = typeof user.$inferSelect;
export type Session      = typeof session.$inferSelect;
export type MlTrainingRun = typeof mlTrainingRuns.$inferSelect;
export type MlModelVersion = typeof mlModelVersions.$inferSelect;
export type MlPredictionRun = typeof mlPredictionRuns.$inferSelect;
export type MlPredictionOutput = typeof mlPredictionOutputs.$inferSelect;
export type AiConversation = typeof aiConversations.$inferSelect;
export type AiMessage = typeof aiMessages.$inferSelect;
