"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { notifyStatusDialog } from "@/components/global-status-dialog-host";
import type { TrainDataSource } from "@/lib/api";
import {
  createTrainingRun,
  fetchTrainingRuns,
  fetchTrainSuggestedCutoff,
  type RunStatus,
  type TrainingRun,
} from "@/lib/ml-api";
import { getDisplayError } from "@/lib/ui-error";
import { getTimestamp } from "./training-utils";
import { promotedSummary } from "./training-run-utils";
import { TrainRunPanel } from "./train-run-panel";
import { TrainingHistoryTable } from "./training-history-table";
import { TrainingResultCards } from "./training-result-cards";

const POLL_INTERVAL_MS = 3_000;

function isActiveRunStatus(status: RunStatus) {
  return status === "in_progress" || status === "pending";
}

function applyTrainingRuns(
  runs: TrainingRun[],
  knownStatuses: Map<string, RunStatus>
): TrainingRun[] {
  const sorted = runs
    .slice()
    .sort((a, b) => getTimestamp(b.started_at) - getTimestamp(a.started_at));

  for (const run of sorted) {
    const previous = knownStatuses.get(run.id);
    if (previous === undefined) {
      knownStatuses.set(run.id, run.status);
      continue;
    }
    if (previous === run.status) continue;

    if (isActiveRunStatus(previous) && run.status === "completed") {
      const promoted = promotedSummary(run.results);
      notifyStatusDialog({
        tone: "success",
        title: "เทรนโมเดลสำเร็จ",
        message: promoted
          ? `Training pipeline เสร็จแล้ว (${promoted})`
          : "Training pipeline เสร็จแล้ว — ดูผลลัพธ์ด้านล่าง",
      });
    } else if (isActiveRunStatus(previous) && run.status === "failed") {
      notifyStatusDialog({
        tone: "error",
        title: "เทรนโมเดลไม่สำเร็จ",
        message: run.error_message ?? "เกิดข้อผิดพลาดระหว่าง training pipeline",
      });
    }

    knownStatuses.set(run.id, run.status);
  }

  return sorted;
}

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
  const [latestDataDate, setLatestDataDate] = useState<string | null>(null);
  const knownStatusesRef = useRef<Map<string, RunStatus>>(new Map());

  const selectedSourceId = selectedSource?.id ?? null;
  useEffect(() => {
    setSuggestedCutoff(null);
    setLatestDataDate(null);
    if (!selectedSourceId) return;
    let alive = true;
    fetchTrainSuggestedCutoff(selectedSourceId)
      .then(({ suggested_cutoff, latest_data_date }) => {
        if (!alive) return;
        setSuggestedCutoff(suggested_cutoff);
        setLatestDataDate(latest_data_date);
      })
      .catch(() => {
        // The panel falls back to its local default when no suggestion is available.
      });
    return () => {
      alive = false;
    };
  }, [selectedSourceId]);

  const load = useCallback(async () => {
    try {
      const data = await fetchTrainingRuns();
      setRuns(applyTrainingRuns(data, knownStatusesRef.current));
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
      knownStatusesRef.current.set(run.id, run.status);
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
        latestDataDate={latestDataDate}
        creating={creating}
        onTrain={(input) => void handleTrain(input)}
      />

      {latestCompleted && <TrainingResultCards run={latestCompleted} />}

      <TrainingHistoryTable runs={runs} />
    </>
  );
}
