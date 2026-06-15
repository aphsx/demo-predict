"use client";

/**
 * Prediction runs surface. Real ML v2 routes are the default; set
 * NEXT_PUBLIC_ML_USE_MOCK=1 for deterministic offline demo data.
 */
import { useCallback, useEffect, useState } from "react";
import { fetchPredictDataSources, type PredictDataSource } from "@/lib/api";
import { fetchPredictionRuns, type PredictionRun } from "@/lib/ml-api";
import { getDisplayError } from "@/lib/ui-error";
import { CreateRunPanel } from "./create-run-panel";
import { PredictSourcesSection } from "./predict-sources-section";
import { RunsTable } from "./runs-table";
import { RUN_POLL_MS } from "./runs-utils";

export function RunsView() {
  const [sources, setSources] = useState<PredictDataSource[]>([]);
  const [runs, setRuns] = useState<PredictionRun[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (!quiet) {
      setSourcesLoading(true);
      setRunsLoading(true);
    }
    setError(null);
    try {
      const [nextSources, nextRuns] = await Promise.all([
        fetchPredictDataSources(),
        fetchPredictionRuns(),
      ]);
      setSources(nextSources);
      setRuns(nextRuns);
    } catch (e) {
      setError(getDisplayError(e, "โหลด prediction runs ไม่สำเร็จ") ?? "โหลด prediction runs ไม่สำเร็จ");
    } finally {
      setSourcesLoading(false);
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!runs.some((run) => run.status === "in_progress")) return undefined;
    const timer = window.setInterval(() => void load({ quiet: true }), RUN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, runs]);

  return (
    <main className="px-8 py-6 pb-12">
      <div className="space-y-5">
        {error && (
          <div className="rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
            {error}
          </div>
        )}

        <CreateRunPanel sources={sources} onCreated={() => load({ quiet: true })} />

        <RunsTable
          runs={runs}
          loading={runsLoading}
          onRefresh={() => load({ quiet: true })}
        />

        <PredictSourcesSection
          sources={sources}
          loading={sourcesLoading}
          onRefresh={() => load({ quiet: true })}
        />
      </div>
    </main>
  );
}
