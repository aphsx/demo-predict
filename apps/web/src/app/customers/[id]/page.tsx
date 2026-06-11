import type { Metadata } from "next";
import { CustomerDetailClient } from "@/features/customers/CustomerDetailClient";

export const metadata: Metadata = { title: "Customer 360 · 1Moby Intelligence" };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerDetailClient accId={id} />;
}
