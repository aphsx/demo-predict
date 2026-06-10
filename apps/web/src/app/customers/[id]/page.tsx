import type { Metadata } from "next";
import { CustomerDetailView } from "@/features/customers/CustomerDetailView";
import { getCustomerDetail } from "@/mocks/customer-detail";

export const metadata: Metadata = { title: "Customer 360 · 1Moby Intelligence" };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { customer, usageTrend } = await getCustomerDetail(id);
  return <CustomerDetailView accId={id} customer={customer} usageTrend={usageTrend} />;
}
