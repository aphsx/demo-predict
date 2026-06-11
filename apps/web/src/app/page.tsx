import type { Metadata } from "next";
import { DashboardClient } from "@/features/dashboard/DashboardClient";

export const metadata: Metadata = { title: "Dashboard · 1Moby Intelligence" };

export default function DashboardPage() {
  // Bound to the active prediction run (spec §2.0/§2.1) — no mock fallback:
  // DashboardClient shows an empty state linking to /runs when no run is completed.
  return <DashboardClient />;
}
