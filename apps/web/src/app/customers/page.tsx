import type { Metadata } from "next";
import { CustomersClient } from "@/features/customers/CustomersClient";

export const metadata: Metadata = { title: "Customers · 1Moby Intelligence" };

export default function CustomersPage() {
  return <CustomersClient />;
}
