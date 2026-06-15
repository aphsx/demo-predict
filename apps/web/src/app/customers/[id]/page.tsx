import type { Metadata } from "next";
import { CustomerDetailClient } from "@/features/customers/customer-detail-client";

export const metadata: Metadata = { title: "Customer 360 · 1Moby Intelligence" };

type CustomerDetailSearchParams = {
  run?: string | string[];
  lifecycle_stage?: string | string[];
  search?: string | string[];
  customer_value_tier?: string | string[];
  churn_risk_level?: string | string[];
};

const CUSTOMER_LIST_QUERY_KEYS = [
  "run",
  "lifecycle_stage",
  "search",
  "customer_value_tier",
  "churn_risk_level",
] as const;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function customersHrefFromParams(searchParams: CustomerDetailSearchParams): string {
  const params = new URLSearchParams();
  CUSTOMER_LIST_QUERY_KEYS.forEach((key) => {
    const value = firstParam(searchParams[key]);
    if (value) params.set(key, value);
  });

  const query = params.toString();
  return query ? `/customers?${query}` : "/customers";
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<CustomerDetailSearchParams>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const run = firstParam(resolvedSearchParams.run);
  return (
    <CustomerDetailClient
      accId={id}
      requestedRunId={run}
      customersHref={customersHrefFromParams(resolvedSearchParams)}
    />
  );
}
