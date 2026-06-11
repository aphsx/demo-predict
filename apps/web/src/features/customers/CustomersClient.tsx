"use client";
/**
 * Binds /customers to the active prediction run (spec §2.0/§2.2):
 * run selector → fetchRunOutputs → CustomersView. Owns loading/empty/error
 * states per spec §5 — no mock fallback when no run is completed.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Database } from "lucide-react";
import RunSelector, { useActiveRun } from "@/components/RunSelector";
import { EmptyState, Skeleton } from "@/components/ui";
import { fetchRunOutputs } from "@/lib/mlApi";
import { CustomersView, type CustomerRow } from "./CustomersView";

// Client-side filtering in CustomersView works on one page of outputs;
// server-side sort keeps the most important customers in that page.
const PAGE_SIZE = 500;

export function CustomersClient() {
  const { run, runId, loading: runsLoading } = useActiveRun();
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    let alive = true;
    setRows(null);
    setError(null);
    fetchRunOutputs(runId, { page: 1, page_size: PAGE_SIZE, sort: "priority_score:desc" })
      .then((page) => alive && setRows(page.data))
      .catch((e: unknown) =>
        alive && setError(e instanceof Error ? e.message : "โหลดข้อมูลลูกค้าไม่สำเร็จ")
      );
    return () => {
      alive = false;
    };
  }, [runId]);

  const selectorBar = (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 px-8 pt-5">
      <RunSelector />
    </div>
  );

  if (!runsLoading && !run) {
    return (
      <div className="px-8 py-10">
        <EmptyState
          icon={Database}
          title="ยังไม่มี prediction run ที่เสร็จสมบูรณ์"
          hint="import ข้อมูล predict แล้วสร้าง run ก่อน — รายชื่อลูกค้าทั้งหมดมาจากผลของ run"
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
      <>
        {selectorBar}
        <div className="px-8 py-6">
          <EmptyState title="โหลดข้อมูลลูกค้าไม่สำเร็จ" hint={error} />
        </div>
      </>
    );
  }

  if (runsLoading || !rows) {
    return (
      <>
        {selectorBar}
        <div className="space-y-3 px-8 py-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-2xl" />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {selectorBar}
      <CustomersView rows={rows} />
    </>
  );
}
