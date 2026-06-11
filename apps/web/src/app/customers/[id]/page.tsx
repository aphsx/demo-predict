import type { Metadata } from "next";
import { CustomerDetailClient } from "@/features/customers/CustomerDetailClient";

export const metadata: Metadata = { title: "Customer 360 · 1Moby Intelligence" };

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { id } = await params;
  const { run } = await searchParams;
  return <CustomerDetailClient accId={id} requestedRunId={run ?? ""} />;
}
