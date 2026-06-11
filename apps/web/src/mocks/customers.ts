import type { PredictionOutput } from "@/lib/api";

export const STAGES = ["Active Paid", "Active Free", "Churned", "Ghost"];

/** Subset of ML output columns shown in the customers list. */
export type CustomerRow = Pick<
  PredictionOutput,
  | "acc_id"
  | "lifecycle_stage"
  | "sub_stage"
  | "churn_probability"
  | "predicted_clv_6m"
  | "customer_value_tier"
  | "n_purchases"
  | "total_revenue"
>;

const MOCK_ROWS: CustomerRow[] = [
  {
    acc_id: 10001,
    lifecycle_stage: "Active Paid",
    sub_stage: "At-risk paid",
    churn_probability: 0.68,
    predicted_clv_6m: 42800,
    customer_value_tier: "high",
    n_purchases: 7,
    total_revenue: 126400,
  },
  {
    acc_id: 10002,
    lifecycle_stage: "Active Free",
    sub_stage: "Engaged free",
    churn_probability: null,
    predicted_clv_6m: null,
    customer_value_tier: "none",
    n_purchases: 0,
    total_revenue: 0,
  },
  {
    acc_id: 10003,
    lifecycle_stage: "Churned",
    sub_stage: "Paid churned",
    churn_probability: null,
    predicted_clv_6m: 0,
    customer_value_tier: "none",
    n_purchases: 3,
    total_revenue: 48500,
  },
  {
    acc_id: 10004,
    lifecycle_stage: "Ghost",
    sub_stage: "Never activated",
    churn_probability: null,
    predicted_clv_6m: null,
    customer_value_tier: "none",
    n_purchases: 0,
    total_revenue: 0,
  },
];

export async function getCustomerRows(): Promise<CustomerRow[]> {
  return MOCK_ROWS;
}
