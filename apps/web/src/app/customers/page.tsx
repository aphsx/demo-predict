import type { Metadata } from "next";
import { CustomersView } from "@/features/customers/CustomersView";
import { getCustomerRows } from "@/mocks/customers";

export const metadata: Metadata = { title: "Customers · 1Moby Intelligence" };

export default async function CustomersPage() {
  const rows = await getCustomerRows();
  return <CustomersView rows={rows} />;
}
