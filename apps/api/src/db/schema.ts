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

// ── ML tables ─────────────────────────────────────────────────────────────────

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

export const rawCustomers = pgTable(
  "raw_customers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id").references(() => predictionRuns.id, { onDelete: "cascade" }),
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
    index("idx_raw_cust_run").on(t.runId),
  ]
);

export const rawPayments = pgTable(
  "raw_payments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id").references(() => predictionRuns.id, { onDelete: "cascade" }),
    accId: integer("acc_id").notNull(),
    paymentUid: bigint("payment_uid", { mode: "number" }),  // original uid from Excel
    paymentDate: timestamp("payment_date", { withTimezone: true }).notNull(),
    amount: numeric("amount"),
    creditAdd: numeric("credit_add"),
    creditType: text("credit_type"),
  },
  (t) => [
    index("idx_raw_pay_run").on(t.runId),
  ]
);

export const rawUsage = pgTable(
  "raw_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id").references(() => predictionRuns.id, { onDelete: "cascade" }),
    accId: integer("acc_id").notNull(),
    year: integer("year"),
    month: integer("month"),
    usage: numeric("usage"),
    channel: text("channel"),
    source: text("source"),
  },
  (t) => [
    index("idx_raw_usage_run").on(t.runId),
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

// ── Convenience type exports ───────────────────────────────────────────────────

export type User         = typeof user.$inferSelect;
export type Session      = typeof session.$inferSelect;
export type ModelVersion = typeof modelVersions.$inferSelect;
export type PredictionRun = typeof predictionRuns.$inferSelect;
export type Prediction   = typeof predictions.$inferSelect;
export type Explanation  = typeof explanations.$inferSelect;
