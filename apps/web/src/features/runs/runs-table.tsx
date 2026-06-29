"use client";
/**
 * Prediction runs list (redesigned, slim). 5 columns: run (+ source subtitle),
 * status (with inline progress / error), customers, when (relative), actions.
 * Polling while in_progress lives in RunsView.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ListChecks, RefreshCw, Trash2 } from "lucide-react";
import { StatusDialog } from "@/components/status-dialog";
import {
  EmptyState, ProgressMeter, SectionCard, Skeleton, StatusPill,
} from "@/components/ui";
import { deletePredictionRun, retryPredictionRun, type PredictionRun } from "@/lib/ml-api";
import { getDisplayError } from "@/lib/ui-error";
import { useRunStore } from "@/stores/run-store";
import { formatRelative, runStatusLabel, runStatusTone } from "./runs-utils";

const actionBtnCls =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-[color:var(--moby-600)] hover:bg-gray-50 disabled:opacity-40";

export function RunsTable({
  runs,
  loading,
  onRefresh,
}: {
  runs: PredictionRun[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const router = useRouter();
  const setRunId = useRunStore((s) => s.setRunId);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteRun, setPendingDeleteRun] = useState<PredictionRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openRun = (run: PredictionRun) => {
    setRunId(run.id);
    router.push("/");
  };

  const retry = async (run: PredictionRun) => {
    setRetryingId(run.id);
    setError(null);
    try {
      await retryPredictionRun(run.id);
      await onRefresh();
    } catch (e) {
      setError(getDisplayError(e, "Retry ไม่สำเร็จ") ?? "Retry ไม่สำเร็จ");
    } finally {
      setRetryingId(null);
    }
  };

  const remove = async (run: PredictionRun) => {
    setDeletingId(run.id);
    setError(null);
    try {
      await deletePredictionRun(run.id);
      setPendingDeleteRun(null);
      await onRefresh();
    } catch (e) {
      setError(getDisplayError(e, "ลบ run ไม่สำเร็จ") ?? "ลบ run ไม่สำเร็จ");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <SectionCard
        eyebrow="Run history"
        title="run ล่าสุด"
        hint="หนึ่งแถวต่อหนึ่งรอบทำนาย — เปิด run ที่ completed เพื่อดู dashboard"
      >
        {error && (
          <div className="mb-4 rounded-2xl border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="ยังไม่มี prediction run — import ข้อมูลและสร้าง run แรก"
            hint="เลือก predict source ที่ ready แล้วกด รัน ด้านบน"
          />
        ) : (
          <div className="overflow-x-auto rounded-[22px] border border-gray-200">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Status</th>
                  <th className="text-right">Customers</th>
                  <th>เมื่อไหร่</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    retrying={retryingId === run.id}
                    deleting={deletingId === run.id}
                    onOpen={() => openRun(run)}
                    onRetry={() => void retry(run)}
                    onDelete={() => setPendingDeleteRun(run)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {pendingDeleteRun && (
        <StatusDialog
          open
          tone="warning"
          title="ยืนยันการลบผลลัพธ์ทำนายรอบนี้"
          confirmLabel="ลบ run"
          cancelLabel="ยกเลิก"
          loading={deletingId === pendingDeleteRun.id}
          onCancel={() => setPendingDeleteRun(null)}
          onConfirm={() => void remove(pendingDeleteRun)}
        />
      )}
    </>
  );
}

function RunRow({
  run,
  retrying,
  deleting,
  onOpen,
  onRetry,
  onDelete,
}: {
  run: PredictionRun;
  retrying: boolean;
  deleting: boolean;
  onOpen: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const inProgress = run.status === "in_progress";
  return (
    <tr>
      <td>
        <div className="font-medium text-[color:var(--ink-1)]">{run.name}</div>
        <div className="text-[11.5px] text-[color:var(--ink-5)]">{run.predict_source_name}</div>
      </td>
      <td>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <StatusPill tone={runStatusTone(run.status)} loading={inProgress}>
              {runStatusLabel(run.status)}
            </StatusPill>
            {run.status === "failed" && run.error_message && (
              <span
                className="max-w-[220px] truncate text-[11px] text-[color:var(--danger)]"
                title={run.error_message}
              >
                {run.error_message}
              </span>
            )}
          </div>
          {inProgress && run.progress && (
            <div className="max-w-[240px]">
              <ProgressMeter value={run.progress.pct} label={run.progress.step} />
            </div>
          )}
        </div>
      </td>
      <td className="text-right num">{run.total_customers?.toLocaleString() ?? "—"}</td>
      <td className="text-[color:var(--ink-3)]">
        {formatRelative(run.finished_at ?? run.created_at)}
      </td>
      <td className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          {run.status === "completed" && (
            <button type="button" onClick={onOpen} className={actionBtnCls}>
              เปิด <ChevronRight size={11} />
            </button>
          )}
          {run.status === "failed" && (
            <button type="button" onClick={onRetry} disabled={retrying} className={actionBtnCls}>
              <RefreshCw size={11} className={retrying ? "animate-spin" : undefined} />
              ลองใหม่
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--ink-4)] hover:bg-[color:var(--danger-bg)] hover:text-[color:var(--danger)] disabled:opacity-40"
            title="ลบ run"
          >
            {deleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </td>
    </tr>
  );
}
