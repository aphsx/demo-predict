"use client";
/**
 * Model training surface (redesigned). Two sections only:
 *   1. TrainPanel       — pick/upload a dataset → Train (cutoff/horizon in Advanced)
 *   2. ModelStatusCards — production champion + latest result + version management
 * This view owns all state: data sources (load/upload/select/delete) and training
 * runs (create/poll/suggested cutoff). The old upload section, dataset table,
 * training-history table, result cards, and version section are gone.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notifyStatusDialog } from "@/components/global-status-dialog-host";
import { StatusDialog } from "@/components/status-dialog";
import { Skeleton } from "@/components/ui";
import {
  deleteTrainDataSource,
  fetchTrainDataSources,
  uploadTrainDataFileWithProgress,
  type TrainDataSource,
} from "@/lib/api";
import {
  createTrainingRun,
  fetchTrainingRuns,
  fetchTrainSuggestedCutoff,
  type RunStatus,
  type TrainingRun,
} from "@/lib/ml-api";
import { getDisplayError } from "@/lib/ui-error";
import { ModelStatusCards } from "./model-status-cards";
import { TrainPanel } from "./train-panel";
import { getTimestamp, wait } from "./training-utils";
import { promotedSummary } from "./training-run-utils";

const POLL_INTERVAL_MS = 3_000;

function isActiveRunStatus(status: RunStatus) {
  return status === "in_progress" || status === "pending";
}

/** Sort newest-first and fire completion/failure toasts on status transitions. */
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

export function TrainingView() {
  const [trainSources, setTrainSources] = useState<TrainDataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Upload state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStep, setImportStep] = useState("");
  const [importPhase, setImportPhase] = useState<"raw" | "clean" | null>(null);

  // Delete-source state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteSource, setPendingDeleteSource] = useState<TrainDataSource | null>(null);

  // Training-run state
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [creating, setCreating] = useState(false);
  const [trainError, setTrainError] = useState<string | null>(null);
  const [suggestedCutoff, setSuggestedCutoff] = useState<string | null>(null);
  const [latestDataDate, setLatestDataDate] = useState<string | null>(null);
  const knownStatusesRef = useRef<Map<string, RunStatus>>(new Map());

  const loadSources = useCallback(async () => {
    setLoadError(null);
    try {
      const sources = await fetchTrainDataSources().catch(() => [] as TrainDataSource[]);
      setTrainSources(Array.isArray(sources) ? sources : []);
    } catch (e) {
      setTrainSources([]);
      setLoadError(getDisplayError(e, "Failed to load training workspace"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const readySources = useMemo(
    () => trainSources.filter((source) => source.import_status === "ready"),
    [trainSources]
  );
  const sortedReady = useMemo(
    () =>
      readySources
        .slice()
        .sort(
          (a, b) =>
            getTimestamp(b.imported_at || b.created_at) -
            getTimestamp(a.imported_at || a.created_at)
        ),
    [readySources]
  );
  const selectedSource =
    sortedReady.find((source) => source.id === selectedSourceId) ?? sortedReady[0] ?? null;

  useEffect(() => {
    if (sortedReady.length === 0) {
      setSelectedSourceId(null);
      return;
    }
    if (selectedSourceId && sortedReady.some((source) => source.id === selectedSourceId)) return;
    setSelectedSourceId(sortedReady[0]?.id ?? null);
  }, [selectedSourceId, sortedReady]);

  // Suggested cutoff for the selected dataset.
  const selectedSourceId2 = selectedSource?.id ?? null;
  useEffect(() => {
    setSuggestedCutoff(null);
    setLatestDataDate(null);
    if (!selectedSourceId2) return;
    let alive = true;
    fetchTrainSuggestedCutoff(selectedSourceId2)
      .then(({ suggested_cutoff, latest_data_date }) => {
        if (!alive) return;
        setSuggestedCutoff(suggested_cutoff);
        setLatestDataDate(latest_data_date);
      })
      .catch(() => {
        // TrainPanel falls back to its local default when no suggestion is available.
      });
    return () => {
      alive = false;
    };
  }, [selectedSourceId2]);

  // Training runs — load + poll while active.
  const loadRuns = useCallback(async () => {
    try {
      const data = await fetchTrainingRuns();
      setRuns(applyTrainingRuns(data, knownStatusesRef.current));
    } catch (e) {
      setTrainError(getDisplayError(e, "โหลดสถานะ training ไม่สำเร็จ"));
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const hasActiveRun = runs.some(
    (run) => run.status === "in_progress" || run.status === "pending"
  );
  useEffect(() => {
    if (!hasActiveRun) return;
    const timer = setInterval(() => void loadRuns(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasActiveRun, loadRuns]);

  const handleUpload = async (file: File) => {
    const datasetName = file.name.replace(/\.xlsx$/i, "");
    setImporting(true);
    setImportProgress(1);
    setImportStep("Uploading Excel file...");
    setImportPhase(null);

    try {
      await uploadTrainDataFileWithProgress(
        file,
        datasetName,
        (event) => {
          setImportProgress(event.progress);
          setImportStep(event.step);
          if (event.phase) setImportPhase(event.phase);
        },
        undefined
      );
      setImportProgress(100);
      setImportStep("Import complete");
      await wait(450);
      await loadSources();
      notifyStatusDialog({
        tone: "success",
        title: "นำเข้าข้อมูลสำเร็จ",
        message: "ระบบ import และ clean data เสร็จเรียบร้อย",
      });
    } catch (e) {
      setImportProgress(0);
      setImportStep("");
      setImportPhase(null);
      const err = e as Error & { code?: string };
      notifyStatusDialog({
        tone: "error",
        title: "นำเข้าข้อมูลไม่สำเร็จ",
        message:
          err.code === "DUPLICATE_FILE"
            ? "ไฟล์นี้ถูกนำเข้าแล้ว เลือก dataset เดิมจากรายการได้เลย"
            : getDisplayError(e, "นำเข้าข้อมูลไม่สำเร็จ") ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
      });
    } finally {
      setImporting(false);
    }
  };

  const deleteSource = async (source: TrainDataSource) => {
    setDeletingId(source.id);
    setPendingDeleteSource(null);
    try {
      await deleteTrainDataSource(source.id);
      setTrainSources((prev) => prev.filter((item) => item.id !== source.id));
    } catch (e) {
      notifyStatusDialog({
        tone: "error",
        title: "ลบ dataset ไม่สำเร็จ",
        message: getDisplayError(e, "ลบ dataset ไม่สำเร็จ") ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleTrain = async (input: { cutoff_date: string; horizon_days: number }) => {
    if (!selectedSource) return;
    setCreating(true);
    setTrainError(null);
    try {
      const run = await createTrainingRun({
        train_source_id: selectedSource.id,
        dataset_name: selectedSource.name,
        cutoff_date: input.cutoff_date,
        horizon_days: input.horizon_days,
      });
      knownStatusesRef.current.set(run.id, run.status);
      setRuns((prev) => [run, ...prev.filter((item) => item.id !== run.id)]);
    } catch (e) {
      setTrainError(getDisplayError(e, "เริ่ม training run ไม่สำเร็จ"));
    } finally {
      setCreating(false);
    }
  };

  const latestCompleted =
    runs.find((run) => run.status === "completed" && (run.results?.length ?? 0) > 0) ?? null;

  if (loading) {
    return (
      <main className="min-w-0 px-4 py-6 pb-12 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <Skeleton className="h-[220px]" />
          <Skeleton className="h-[200px]" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-w-0 px-4 py-6 pb-12 sm:px-6 lg:px-8">
      <div className="space-y-6">
        {(loadError || trainError) && (
          <div className="rounded-2xl border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
            {loadError ?? trainError}
          </div>
        )}

        <TrainPanel
          readySources={sortedReady}
          selectedSource={selectedSource}
          onSelect={(id) => setSelectedSourceId(id)}
          onDeleteSource={(source) => setPendingDeleteSource(source)}
          onUpload={(file) => void handleUpload(file)}
          importing={importing}
          importProgress={importProgress}
          importStep={importStep}
          importPhase={importPhase}
          suggestedCutoff={suggestedCutoff}
          latestDataDate={latestDataDate}
          creating={creating}
          onTrain={handleTrain}
        />

        <ModelStatusCards key={latestCompleted?.finished_at ?? "none"} latestRun={latestCompleted} />
      </div>

      {pendingDeleteSource && (
        <StatusDialog
          open
          tone="warning"
          title="ยืนยันการลบ dataset"
          message="ข้อมูล raw และ clean ทั้งหมดของ dataset นี้จะถูกลบถาวร"
          confirmLabel="ลบ dataset"
          cancelLabel="ยกเลิก"
          loading={deletingId === pendingDeleteSource.id}
          onCancel={() => setPendingDeleteSource(null)}
          onConfirm={() => void deleteSource(pendingDeleteSource)}
        />
      )}
    </main>
  );
}
