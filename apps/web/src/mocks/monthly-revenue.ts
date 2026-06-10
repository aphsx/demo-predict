/**
 * Monthly revenue series shared by the dashboard and /monthly-value pages.
 * Production source: group `Backend_payment.amount` by `payment_date` month.
 */

export type MonthlyRevenuePoint = {
  month: string;
  revenue: number;
  payments: number;
  sms_usage: number;
  email_usage: number;
};

const MONTHLY_REVENUE: MonthlyRevenuePoint[] = [
  { month: "2025-07", revenue: 742000, payments: 58, sms_usage: 1180000, email_usage: 960000 },
  { month: "2025-08", revenue: 786000, payments: 63, sms_usage: 1310000, email_usage: 1010000 },
  { month: "2025-09", revenue: 821000, payments: 66, sms_usage: 1260000, email_usage: 1120000 },
  { month: "2025-10", revenue: 805000, payments: 61, sms_usage: 1410000, email_usage: 1060000 },
  { month: "2025-11", revenue: 864000, payments: 70, sms_usage: 1370000, email_usage: 1280000 },
  { month: "2025-12", revenue: 912000, payments: 74, sms_usage: 1530000, email_usage: 1210000 },
  { month: "2026-01", revenue: 895000, payments: 72, sms_usage: 1460000, email_usage: 1510000 },
  { month: "2026-02", revenue: 936000, payments: 76, sms_usage: 1710000, email_usage: 1370000 },
  { month: "2026-03", revenue: 971000, payments: 81, sms_usage: 1980000, email_usage: 1490000 },
  { month: "2026-04", revenue: 1008000, payments: 83, sms_usage: 1590000, email_usage: 1710000 },
  { month: "2026-05", revenue: 1181000, payments: 90, sms_usage: 2400000, email_usage: 1580000 },
  { month: "2026-06", revenue: 1048000, payments: 84, sms_usage: 1760000, email_usage: 1660000 },
];

export async function getMonthlyRevenue(): Promise<MonthlyRevenuePoint[]> {
  return MONTHLY_REVENUE;
}
