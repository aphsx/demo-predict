"use client";

import { useCallback, useEffect, useState } from "react";
import type { TrainDataSource } from "@/lib/api";
import {
  createTrainingRun,
  fetchTrainingRuns,
  fetchTrainSuggestedCutoff,
  type TrainingRun,
} from "@/lib/mlApi";
import { getDisplayError } from "@/lib/ui-error";
import { getTimestamp } from "./training-utils";
import { TrainRunPanel } from "./TrainRunPanel";
import { TrainingHistoryTable } from "./TrainingHistoryTable";
import { TrainingResultCards } from "./TrainingResultCards";

const POLL_INTERVAL_MS = 3_000;

/**
 * ML v2 training section (spec §2.6) — train panel + latest result cards +
 * training history. Served from the mock provider until the training runner
 * is mounted (MockBadge shown in TrainRunPanel).
 */
export function TrainingRunsSection({
  selectedSource,
}: {
  /** "ready" dataset selected in the table above, or null */
  selectedSource: TrainDataSource | null;
}) {
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedCutoff, setSuggestedCutoff] = useState<string | null>(null);

  // Gate 3 suggestion for the selected dataset — used as the cutoff default
  // in TrainRunPanel (spec §2.6); the user can still override it.
  const selectedSourceId = selectedSource?.id ?? null;
  useEffect(() => {
    setSuggestedCutoff(null);
    if (!selectedSourceId) return;
    let alive = true;
    fetchTrainSuggestedCutoff(selectedSourceId)
      .then(({ suggested_cutoff }) => {
        if (alive) setSuggestedCutoff(suggested_cutoff);
      })
      .catch(() => {
        // panel falls back to its local default when no suggestion is available
      });
    return () => {
      alive = false;
    };
  }, [selectedSourceId]);

  const load = useCallback(async () => {
    try {
      const data = await fetchTrainingRuns();
      setRuns(
        data.slice().sort((a, b) => getTimestamp(b.started_at) - getTimestamp(a.started_at))
      );
    } catch (e) {
      setError(getDisplayError(e, "โหลด training history ไม่สำเร็จ"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll every 3s while any run is still in progress.
  const hasActiveRun = runs.some(
    (run) => run.status === "in_progress" || run.status === "pending"
  );
  useEffect(() => {
    if (!hasActiveRun) return;
    const timer = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasActiveRun, load]);

  const handleTrain = async (input: { cutoff_date: string; horizon_days: number }) => {
    if (!selectedSource) return;
    setCreating(true);
    setError(null);
    try {
      const run = await createTrainingRun({
        train_source_id: selectedSource.id,
        dataset_name: selectedSource.name,
        cutoff_date: input.cutoff_date,
        horizon_days: input.horizon_days,
      });
      // Show the new run as in-progress immediately; polling keeps it fresh.
      setRuns((prev) => [run, ...prev.filter((item) => item.id !== run.id)]);
    } catch (e) {
      setError(getDisplayError(e, "เริ่ม training run ไม่สำเร็จ"));
    } finally {
      setCreating(false);
    }
  };

  const latestCompleted =
    runs.find((run) => run.status === "completed" && (run.results?.length ?? 0) > 0) ?? null;

  return (
    <>
      {error && (
        <div className="rounded-2xl border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
          {error}
        </div>
      )}

      <TrainRunPanel
        selectedSource={selectedSource}
        suggestedCutoff={suggestedCutoff}
        creating={creating}
        onTrain={(input) => void handleTrain(input)}
      />

      {latestCompleted && <TrainingResultCards run={latestCompleted} />}

      <TrainingHistoryTable runs={runs} />
    </>
  );
}
