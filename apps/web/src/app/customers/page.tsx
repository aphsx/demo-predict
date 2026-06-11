import type { Metadata } from "next";
import { CustomersClient } from "@/features/customers/CustomersClient";

export const metadata: Metadata = { title: "Customers · 1Moby Intelligence" };

export default function CustomersPage() {
  // Bound to the active prediction run (spec §2.0/§2.2) — no mock fallback.
  return <CustomersClient />;
}
