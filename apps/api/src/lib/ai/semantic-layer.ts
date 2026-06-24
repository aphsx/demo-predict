export type AiUserRole = "viewer" | "analyst" | "admin";

export type SemanticColumn = {
  name: string;
  type: "uuid" | "text" | "integer" | "numeric" | "boolean" | "date" | "timestamp" | "json";
  description: string;
  sensitive?: boolean;
};

export type SemanticTable = {
  name: string;
  description: string;
  minimumRole: AiUserRole;
  columns: SemanticColumn[];
};

export const ROLE_RANK: Record<AiUserRole, number> = {
  viewer: 1,
  analyst: 2,
  admin: 3,
};

export const AI_SQL_DEFAULT_LIMIT = 50;
export const AI_SQL_MAX_LIMIT = 100;

export const SEMANTIC_TABLES: SemanticTable[] = [
  {
    name: "predict_data_sources",
    description: "Uploaded prediction datasets and import/clean status.",
    minimumRole: "viewer",
    columns: [
      { name: "id", type: "uuid", description: "Prediction data source id." },
      { name: "name", type: "text", description: "Human-readable data source name." },
      { name: "client_label", type: "text", description: "Optional client or portfolio label." },
      { name: "original_filename", type: "text", description: "Original uploaded Excel filename." },
      { name: "import_status", type: "text", description: "Import lifecycle status such as pending, ready, failed." },
      { name: "imported_at", type: "timestamp", description: "When the raw import completed." },
      { name: "cleaned_at", type: "timestamp", description: "When clean tables were generated." },
      { name: "created_at", type: "timestamp", description: "When the source record was created." },
    ],
  },
  {
    name: "predict_clean_customers",
    description: "Clean customer profile rows for prediction datasets.",
    minimumRole: "analyst",
    columns: [
      { name: "source_id", type: "uuid", description: "Prediction data source id." },
      { name: "acc_id", type: "integer", description: "1Moby customer account id." },
      { name: "status_sms", type: "text", description: "SMS account status." },
      { name: "status_email", type: "text", description: "Email account status." },
      { name: "credit_sms", type: "numeric", description: "Remaining SMS credits." },
      { name: "credit_email", type: "numeric", description: "Remaining Email credits." },
      { name: "expire_sms", type: "date", description: "SMS credit expiry date." },
      { name: "expire_email", type: "date", description: "Email credit expiry date." },
      { name: "join_date", type: "date", description: "Customer join date." },
      { name: "last_access", type: "timestamp", description: "Last account access timestamp." },
      { name: "last_send", type: "timestamp", description: "Last message send timestamp." },
    ],
  },
  {
    name: "predict_clean_payments",
    description: "Clean customer payment and top-up transactions for prediction datasets.",
    minimumRole: "analyst",
    columns: [
      { name: "source_id", type: "uuid", description: "Prediction data source id." },
      { name: "acc_id", type: "integer", description: "1Moby customer account id." },
      { name: "payment_date", type: "timestamp", description: "Payment transaction timestamp." },
      { name: "amount", type: "numeric", description: "Payment amount." },
      { name: "credit_add", type: "numeric", description: "Credits added by this transaction." },
      { name: "credit_type", type: "text", description: "Credit type such as SMS or Email." },
    ],
  },
  {
    name: "predict_clean_usage",
    description: "Clean monthly usage rows by account, channel, and usage source.",
    minimumRole: "analyst",
    columns: [
      { name: "source_id", type: "uuid", description: "Prediction data source id." },
      { name: "acc_id", type: "integer", description: "1Moby customer account id." },
      { name: "year", type: "integer", description: "Usage year." },
      { name: "month", type: "integer", description: "Usage month." },
      { name: "usage", type: "numeric", description: "Credit usage count." },
      { name: "channel", type: "text", description: "Channel such as SMS or Email." },
      { name: "usage_source", type: "text", description: "Usage product source such as BC, API, or OTP." },
    ],
  },
  {
    name: "ml_prediction_runs",
    description: "ML prediction run catalog and run status.",
    minimumRole: "viewer",
    columns: [
      { name: "id", type: "uuid", description: "Prediction run id." },
      { name: "predict_source_id", type: "uuid", description: "Prediction data source id used for the run." },
      { name: "status", type: "text", description: "Run status such as pending, running, done, failed." },
      { name: "cutoff_date", type: "date", description: "Point-in-time cutoff date for predictions." },
      { name: "started_at", type: "timestamp", description: "Run start timestamp." },
      { name: "finished_at", type: "timestamp", description: "Run completion timestamp." },
      { name: "total_customers", type: "integer", description: "Number of customers in the run." },
      { name: "created_at", type: "timestamp", description: "When the run was created." },
    ],
  },
  {
    name: "ml_prediction_outputs",
    description: "Per-customer ML prediction outputs: churn, lifecycle, CLV, credit forecast, and recommended action.",
    minimumRole: "analyst",
    columns: [
      { name: "prediction_run_id", type: "uuid", description: "Prediction run id." },
      { name: "acc_id", type: "integer", description: "1Moby customer account id." },
      { name: "lifecycle_stage", type: "text", description: "Rule-based lifecycle stage." },
      { name: "sub_stage", type: "text", description: "Detailed lifecycle sub-stage." },
      { name: "churn_probability", type: "numeric", description: "Predicted churn probability from 0 to 1." },
      { name: "churn_risk_level", type: "text", description: "Risk bucket derived from churn probability." },
      { name: "predicted_clv_6m", type: "numeric", description: "Predicted customer lifetime value over six months." },
      { name: "customer_value_tier", type: "text", description: "Customer value segment." },
      { name: "revenue_at_risk", type: "numeric", description: "Estimated revenue at risk." },
      { name: "predicted_credit_usage_30d", type: "numeric", description: "Forecasted credit usage over 30 days." },
      { name: "predicted_credit_usage_90d", type: "numeric", description: "Forecasted credit usage over 90 days." },
      { name: "estimated_days_until_topup", type: "integer", description: "Estimated days until next top-up is needed." },
      { name: "credit_urgency_level", type: "text", description: "Urgency bucket for credit top-up." },
      { name: "usage_trend", type: "text", description: "Recent usage trend." },
      { name: "days_since_last_activity", type: "integer", description: "Days since the last observed customer activity." },
      { name: "n_purchases", type: "integer", description: "Observed number of purchases." },
      { name: "total_revenue", type: "numeric", description: "Observed total revenue." },
      { name: "avg_transaction_value", type: "numeric", description: "Average transaction value." },
      { name: "ever_paid", type: "boolean", description: "Whether the customer has ever paid." },
      { name: "priority_score", type: "numeric", description: "Business priority score (0-100), a display rescale of revenue_at_risk; ranks customers by expected money at risk." },
      { name: "segment", type: "text", description: "Actionable customer segment (Protect, Stabilize, Grow, Develop, Maintain, Watch-low, Salvage-low, Reactivate, Dormant, Ghost) from value tier × churn risk × lifecycle." },
      { name: "action_rank", type: "integer", description: "Global work-list rank (1 = act first), ordered by segment priority then money within each segment." },
      { name: "needs_review", type: "boolean", description: "Flagged for human review: high churn risk, or a valuable customer whose p_alive and usage have silently collapsed." },
      { name: "output_status", type: "text", description: "Prediction output status." },
      { name: "created_at", type: "timestamp", description: "When the prediction output was created." },
    ],
  },
];

export function getAiUserRole(): AiUserRole {
  const role = process.env.AI_CHAT_DEFAULT_ROLE?.trim().toLowerCase();
  if (role === "admin" || role === "analyst" || role === "viewer") return role;
  return "analyst";
}

export function getAllowedTables(role: AiUserRole): SemanticTable[] {
  return SEMANTIC_TABLES.filter((table) => ROLE_RANK[role] >= ROLE_RANK[table.minimumRole]);
}

export function renderSemanticLayerForPrompt(role: AiUserRole): string {
  return getAllowedTables(role)
    .map((table) => {
      const columns = table.columns
        .filter((column) => !column.sensitive)
        .map((column) => `- ${column.name} (${column.type}): ${column.description}`)
        .join("\n");
      return `Table: ${table.name}\nPurpose: ${table.description}\nColumns:\n${columns}`;
    })
    .join("\n\n");
}
