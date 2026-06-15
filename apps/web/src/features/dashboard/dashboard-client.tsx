"use client";
/**
 * Binds the dashboard to the active prediction run (spec §2.0/§2.1):
 * run selector → fetchRunSummary → DashboardView. Owns loading/empty/error
 * states per spec §5 — never falls back to fake numbers silently.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Database } from "lucide-react";
import { useActiveRun } from "@/components/run-selector";
import { EmptyState, Skeleton } from "@/components/ui";
import { fetchRunSummary, type RunSummary } from "@/lib/ml-api";
import { DashboardView } from "./dashboard-view";

export function DashboardClient() {
  const { run, runId, loading: runsLoading } = useActiveRun();
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    let alive = true;
    setSummary(null);
    setError(null);
    fetchRunSummary(runId)
      .then((s) => alive && setSummary(s))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"));
    return () => {
      alive = false;
    };
  }, [runId]);

  if (!runsLoading && !run) {
    return (
      <div className="px-4 py-10 sm:px-6 lg:px-8">
        <EmptyState
          icon={Database}
          title="ยังไม่มี prediction run ที่เสร็จสมบูรณ์"
          hint="import ข้อมูล predict แล้วสร้าง run ก่อน ตัวเลขบน dashboard ทั้งหมดมาจากผลของ run"
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
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <EmptyState title="โหลด summary ไม่สำเร็จ" hint={error} />
      </div>
    );
  }

  if (runsLoading || !summary) {
    return (
      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <Skeleton className="h-28 w-full rounded-[26px]" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[22px]" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-[26px]" />
      </div>
    );
  }

  return <DashboardView summary={summary} runId={runId} />;
}
