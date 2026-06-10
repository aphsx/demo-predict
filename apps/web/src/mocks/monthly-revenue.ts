/**
 * Monthly revenue series shared by the dashboard and /monthly-value pages.
 * Production source: group `Backend_payment.amount` by `payment_date` month.
 */

export type MonthlyRevenuePoint = {
  month: string;
  revenue: number;
  payments: number;
};

const MONTHLY_REVENUE: MonthlyRevenuePoint[] = [
  { month: "2025-07", revenue: 742000, payments: 58 },
  { month: "2025-08", revenue: 786000, payments: 63 },
  { month: "2025-09", revenue: 821000, payments: 66 },
  { month: "2025-10", revenue: 805000, payments: 61 },
  { month: "2025-11", revenue: 864000, payments: 70 },
  { month: "2025-12", revenue: 912000, payments: 74 },
  { month: "2026-01", revenue: 895000, payments: 72 },
  { month: "2026-02", revenue: 936000, payments: 76 },
  { month: "2026-03", revenue: 971000, payments: 81 },
  { month: "2026-04", revenue: 1008000, payments: 83 },
  { month: "2026-05", revenue: 1181000, payments: 90 },
  { month: "2026-06", revenue: 1048000, payments: 84 },
];

export async function getMonthlyRevenue(): Promise<MonthlyRevenuePoint[]> {
  return MONTHLY_REVENUE;
}
