import type { Metadata } from "next";
import { DashboardClient } from "@/features/dashboard/DashboardClient";

export const metadata: Metadata = { title: "Dashboard · 1Moby Intelligence" };

export default function DashboardPage() {
  return <DashboardClient />;
}
