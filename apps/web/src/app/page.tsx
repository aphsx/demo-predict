import type { Metadata } from "next";
import { DashboardView } from "@/features/dashboard/DashboardView";
import { getDashboardOverview } from "@/mocks/dashboard";
import { getMonthlyRevenue } from "@/mocks/monthly-revenue";

export const metadata: Metadata = { title: "Dashboard · 1Moby Intelligence" };

export default async function DashboardPage() {
  const [overview, monthlyRevenue] = await Promise.all([
    getDashboardOverview(),
    getMonthlyRevenue(),
  ]);
  return <DashboardView overview={overview} monthlyRevenue={monthlyRevenue} />;
}
