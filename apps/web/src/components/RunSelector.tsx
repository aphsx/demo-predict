"use client";
/**
 * Run selector (spec §2.0) — binds /, /customers, /customers/[id] to one
 * completed prediction run. Defaults to the latest completed run.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, ChevronDown } from "lucide-react";
import { useRunStore } from "@/stores/runStore";
import { fetchPredictionRuns, type PredictionRun } from "@/lib/mlApi";

export function useActiveRun() {
  const { runId, setRunId } = useRunStore();
  const [runs, setRuns] = useState<PredictionRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchPredictionRuns()
      .then((all) => {
        if (!alive) return;
        const completed = all.filter((r) => r.status === "completed");
        setRuns(completed);
        // default = latest completed; also recover from a stale stored id
        if (completed.length && (!runId || !completed.some((r) => r.id === runId))) {
          setRunId(completed[0].id);
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = runs.find((r) => r.id === runId) ?? null;
  return { run, runs, runId: run?.id ?? "", setRunId, loading };
}

export function MockBadge() {
  return null;
}

export default function RunSelector() {
  const { run, runs, runId, setRunId, loading } = useActiveRun();

  if (!loading && runs.length === 0) {
    return (
      <Link
        href="/runs"
        className="h-9 px-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white text-[13px] text-[color:var(--ink-3)] hover:border-[color:var(--moby-200)]"
      >
        <Calendar size={14} className="text-[color:var(--ink-4)]" />
        ยังไม่มี prediction run — สร้างที่หน้า Runs
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          value={runId}
          onChange={(e) => setRunId(e.target.value)}
          disabled={loading}
          className="appearance-none h-9 pl-9 pr-9 rounded-lg border border-gray-200 bg-white text-[13px] text-[color:var(--ink-2)] hover:border-[color:var(--moby-200)] cursor-pointer min-w-[230px]"
        >
          {loading && <option value="">Loading runs…</option>}
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · cutoff {r.cutoff_date}
            </option>
          ))}
        </select>
        <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ink-4)] pointer-events-none" />
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--ink-4)] pointer-events-none" />
      </div>
    </div>
  );
}
