"use client";
/**
 * Spec §2.5 — prediction runs table. Polling while in_progress lives in
 * RunsView; this component renders rows + per-run actions.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ListChecks, RefreshCw, Trash2 } from "lucide-react";
import { StatusDialog } from "@/components/StatusDialog";
import {
  EmptyState, ProgressMeter, SectionCard, Skeleton,
} from "@/components/ui";
import { deletePredictionRun, retryPredictionRun, type PredictionRun } from "@/lib/mlApi";
import { getDisplayError } from "@/lib/ui-error";
import { useRunStore } from "@/stores/runStore";
import { formatDate, formatDateTime, runStatusLabel } from "./runs-utils";

const COLUMNS = 8;

const actionBtnCls =
  "h-7 px-2.5 rounded-md border border-[color:var(--moby-100)] bg-white text-[11.5px] text-[color:var(--moby-600)] hover:border-[color:var(--moby-200)] inline-flex items-center gap-1 disabled:opacity-40";

const RUN_STATUS_COLOR: Record<PredictionRun["status"], string> = {
  pending: "#ffa400",
  in_progress: "#1893f0",
  completed: "#059669",
  failed: "#fc4c02",
};

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
        title="Prediction runs"
        hint="หนึ่งแถวต่อหนึ่งรอบทำนาย — เปิด run ที่ completed เพื่อดู dashboard"
      >
        {error && (
          <div className="mb-3 rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-3 py-2 text-[12.5px] text-[color:var(--danger)]">
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
            hint="เลือก predict source ที่ ready แล้วกด Create run ด้านบน"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Cutoff</th>
                  <th className="text-right">Customers</th>
                  <th>Created by</th>
                  <th>Finished</th>
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
          title="ยืนยันการลบ prediction run"
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
    <>
      <tr>
        <td className="font-medium text-[color:var(--ink-1)]">{run.name}</td>
        <td>
          <div className="flex items-center gap-2">
            <RunStatusBadge status={run.status} />
            {run.status === "failed" && run.error_message && (
              <span
                className="text-[11px] text-[color:var(--danger)] truncate max-w-[220px]"
                title={run.error_message}
              >
                {run.error_message}
              </span>
            )}
          </div>
        </td>
        <td className="text-[color:var(--ink-3)]">{run.predict_source_name}</td>
        <td className="num">{formatDate(run.cutoff_date)}</td>
        <td className="text-right num">{run.total_customers?.toLocaleString() ?? "—"}</td>
        <td className="text-[11.5px] text-[color:var(--ink-4)]">{run.created_by ?? "—"}</td>
        <td className="text-[11.5px] text-[color:var(--ink-4)]">
          {formatDateTime(run.finished_at)}
        </td>
        <td className="text-right">
          <div className="flex items-center justify-end gap-1.5">
            {run.status === "completed" && (
              <button
                type="button"
                onClick={onOpen}
                className={actionBtnCls}
              >
                Open <ChevronRight size={11} />
              </button>
            )}
            {run.status === "failed" && (
              <button type="button" onClick={onRetry} disabled={retrying} className={actionBtnCls}>
                <RefreshCw size={11} className={retrying ? "animate-spin" : undefined} />
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="h-7 w-7 grid place-items-center rounded-md text-[color:var(--ink-4)] hover:text-[color:var(--danger)] hover:bg-[color:var(--danger-bg)] disabled:opacity-40"
              title="Delete run"
            >
              {deleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          </div>
        </td>
      </tr>
      {inProgress && run.progress && (
        <tr>
          <td colSpan={COLUMNS} className="!py-2 bg-[color:var(--moby-50)]">
            <div className="max-w-md">
              <ProgressMeter value={run.progress.pct} label={run.progress.step} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function RunStatusBadge({ status }: { status: PredictionRun["status"] }) {
  const inProgress = status === "in_progress";

  return (
    <span
      className="inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold text-white"
      style={{ backgroundColor: RUN_STATUS_COLOR[status] }}
    >
      {inProgress ? <RefreshCw size={12} className="animate-spin" /> : null}
      {runStatusLabel[status]}
    </span>
  );
}
