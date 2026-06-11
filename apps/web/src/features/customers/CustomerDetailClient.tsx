"use client";
/**
 * Binds /customers/[id] to the URL-selected or active prediction run (spec §2.0/§2.3):
 * run selector → fetchRunOutput + fetchCustomerUsageMonthly →
 * CustomerDetailView. No mock fallback — empty state links to /runs.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Database } from "lucide-react";
import { useActiveRun } from "@/components/RunSelector";
import { EmptyState, Skeleton } from "@/components/ui";
import { fetchCustomerUsageMonthly, fetchRunOutput } from "@/lib/mlApi";
import {
  CustomerDetailView,
  type CustomerDetail,
  type UsageTrendPoint,
} from "./CustomerDetailView";

export function CustomerDetailClient({
  accId,
  requestedRunId,
}: {
  accId: string;
  requestedRunId: string;
}) {
  const { run, runId, runs, setRunId, loading: runsLoading } = useActiveRun();
  const effectiveRunId =
    requestedRunId && runs.some((candidate) => candidate.id === requestedRunId)
      ? requestedRunId
      : runId;
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [usageTrend, setUsageTrend] = useState<UsageTrendPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestedRunId || runsLoading) return;
    if (runs.some((candidate) => candidate.id === requestedRunId)) {
      setRunId(requestedRunId);
    }
  }, [requestedRunId, runs, runsLoading, setRunId]);

  useEffect(() => {
    if (!effectiveRunId) return;
    let alive = true;
    setCustomer(null);
    setUsageTrend([]);
    setError(null);
    Promise.all([
      fetchRunOutput(effectiveRunId, accId),
      fetchCustomerUsageMonthly(effectiveRunId, accId),
    ])
      .then(([output, usage]) => {
        if (!alive) return;
        setCustomer(output);
        setUsageTrend(usage.map((point) => ({ month: point.month, usage: point.total })));
      })
      .catch((e: unknown) =>
        alive && setError(e instanceof Error ? e.message : "โหลดข้อมูลลูกค้าไม่สำเร็จ")
      );
    return () => {
      alive = false;
    };
  }, [effectiveRunId, accId]);

  const effectiveRun = runs.find((candidate) => candidate.id === effectiveRunId) ?? run;

  if (!runsLoading && !effectiveRun) {
    return (
      <div className="px-8 py-10">
        <EmptyState
          icon={Database}
          title="ยังไม่มี prediction run ที่เสร็จสมบูรณ์"
          hint="import ข้อมูล predict แล้วสร้าง run ก่อน — ข้อมูลลูกค้ารายคนมาจากผลของ run"
          action={
            <Link
              href="/runs"
              className="inline-flex h-9 items-center rounded-lg bg-[color:var(--moby-600)] px-4 text-[13px] font-medium text-white hover:bg-[color:var(--moby-700)]"
            >
              ไปหน้า Prediction Runs
            </Link>
          }
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-8 py-6">
        <EmptyState title={`โหลดข้อมูล account ${accId} ไม่สำเร็จ`} hint={error} />
      </div>
    );
  }

  if (runsLoading || !customer) {
    return (
      <div className="space-y-5 px-8 py-5">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-[26px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <CustomerDetailView
      accId={accId}
      customer={customer}
      usageTrend={usageTrend}
      runId={effectiveRun?.id}
    />
  );
}
