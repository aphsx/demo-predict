/** Customer 360 mock shown on /customers/[id]. */

export type CustomerDetail = {
  lifecycle_stage: string;
  sub_stage: string;
  churn_probability: number;
  churn_risk_level: string;
  predicted_clv_6m: number;
  customer_value_tier: string;
  revenue_at_risk: number;
  predicted_credit_usage_30d: number;
  predicted_credit_usage_90d: number;
  estimated_days_until_topup: number;
  credit_urgency_level: string;
  usage_trend: string;
  days_since_last_activity: number;
  n_purchases: number;
  total_revenue: number;
  avg_transaction_value: number;
  ever_paid: boolean;
  ai_status: string;
  ai_explanation: string;
  ai_recommended_message: string;
  ai_model: string;
  output_status: string;
};

export type UsageTrendPoint = {
  month: string;
  usage: number;
};

const MOCK_CUSTOMER: CustomerDetail = {
  lifecycle_stage: "Active Paid",
  sub_stage: "At-risk paid",
  churn_probability: 0.68,
  churn_risk_level: "High",
  predicted_clv_6m: 42800,
  customer_value_tier: "High value",
  revenue_at_risk: 29104,
  predicted_credit_usage_30d: 18450,
  predicted_credit_usage_90d: 56100,
  estimated_days_until_topup: 9,
  credit_urgency_level: "Warning",
  usage_trend: "Declining",
  days_since_last_activity: 18,
  n_purchases: 7,
  total_revenue: 126400,
  avg_transaction_value: 18057,
  ever_paid: true,
  ai_status: "generated",
  ai_explanation:
    "ลูกค้ารายนี้ยังเป็น Active Paid และมีมูลค่าสูง แต่ usage trend ลดลงต่อเนื่อง ประกอบกับวันล่าสุดที่ใช้งานเริ่มห่าง จึงควรติดต่อก่อนถึงรอบเติมเครดิตถัดไป",
  ai_recommended_message:
    "สวัสดีครับ ทีม 1Moby เห็นว่า usage ช่วงนี้ลดลงเล็กน้อย อยากช่วยรีวิวแคมเปญและเครดิตที่เหลือ เพื่อให้รอบส่งถัดไปราบรื่นขึ้นครับ",
  ai_model: "gemini-pro",
  output_status: "predicted",
};

const USAGE_TREND: UsageTrendPoint[] = [
  { month: "Jan", usage: 64200 },
  { month: "Feb", usage: 61800 },
  { month: "Mar", usage: 58400 },
  { month: "Apr", usage: 51200 },
  { month: "May", usage: 43800 },
  { month: "Jun", usage: 36100 },
];

export async function getCustomerDetail(
  _accId: string,
): Promise<{ customer: CustomerDetail; usageTrend: UsageTrendPoint[] }> {
  // Mock ignores the account id; the signature matches the future API call.
  return { customer: MOCK_CUSTOMER, usageTrend: USAGE_TREND };
}
