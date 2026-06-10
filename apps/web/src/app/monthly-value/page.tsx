import type { Metadata } from "next";
import { MonthlyValueView } from "@/features/monthly-value/MonthlyValueView";
import { getMonthlyRevenue } from "@/mocks/monthly-revenue";

export const metadata: Metadata = { title: "Monthly Value · 1Moby Intelligence" };

export default async function MonthlyValuePage() {
  const data = await getMonthlyRevenue();
  return <MonthlyValueView data={data} />;
}
