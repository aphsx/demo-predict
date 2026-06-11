import type { Metadata } from "next";
import { CustomerDetailClient } from "@/features/customers/CustomerDetailClient";

export const metadata: Metadata = { title: "Customer 360 · 1Moby Intelligence" };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Bound to the active prediction run (spec §2.0/§2.3) — no mock fallback.
  return <CustomerDetailClient accId={id} />;
}
