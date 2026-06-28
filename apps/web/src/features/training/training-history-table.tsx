"use client";

import { History, RefreshCw, Trash2 } from "lucide-react";
import { EmptyState, ProgressMeter, StatusPill } from "@/components/ui";
import type { TrainingRun } from "@/lib/ml-api";
import { formatDate } from "./training-utils";
import {
  primaryResultSummary,
  promotedSummary,
  runStatusLabel,
  runStatusTone,
} from "./training-run-utils";

/** Training history table (spec §2.6.3). Dataset column intentionally omitted —
 * the page is model-centric; only when/status/results/promoted matter here. */
export function TrainingHistoryTable({
  runs,
  deletingId,
  onDelete,
}: {
  runs: TrainingRun[];
  deletingId?: string | null;
  onDelete?: (run: TrainingRun) => void;
}) {
  return (
    <section className="surface-elev overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
        <p className="type-label">Training history</p>
        <h2 className="type-section-title mt-1 text-[20px]">ครั้งที่แล้วเทรนเมื่อไหร่</h2>
      </div>

      <div className="p-5">
        {runs.length === 0 ? (
          <EmptyState icon={History} title="ยังไม่เคยเทรน" hint="เลือก dataset แล้วกด Train" />
        ) : (
          <div className="overflow-x-auto rounded-[22px] border border-gray-200">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Cutoff</th>
                  <th className="text-right">Horizon</th>
                  <th>Status</th>
                  <th>Primary result</th>
                  <th>Promoted</th>
                  <th>By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <HistoryRow
                    key={run.id}
                    run={run}
                    deleting={deletingId === run.id}
                    onDelete={onDelete ? () => onDelete(run) : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function HistoryRow({
  run,
  deleting,
  onDelete,
}: {
  run: TrainingRun;
  deleting: boolean;
  onDelete?: () => void;
}) {
  const inProgress = run.status === "in_progress";
  const summary = primaryResultSummary(run.results);
  const promoted = promotedSummary(run.results);

  return (
    <tr>
      <td className="whitespace-nowrap text-[12px] text-[color:var(--ink-3)]">
        {formatDate(run.started_at)}
      </td>
      <td className="num whitespace-nowrap">{run.cutoff_date}</td>
      <td className="num text-right">{run.horizon_days}d</td>
      <td>
        <StatusPill tone={runStatusTone(run.status)}>{runStatusLabel(run.status)}</StatusPill>
        {run.status === "failed" && run.error_message && (
          <div className="mt-1 max-w-[260px] text-[11.5px] text-[color:var(--danger)]">
            {run.error_message}
          </div>
        )}
      </td>
      <td>
        {inProgress ? (
          <div className="min-w-[160px]">
            <ProgressMeter
              value={run.progress?.pct ?? 0}
              tone="blue"
              label={run.progress?.phase ?? "Starting..."}
            />
          </div>
        ) : summary ? (
          <span className="num text-[12.5px]">{summary}</span>
        ) : (
          <span className="text-[12px] text-[color:var(--ink-5)]">—</span>
        )}
      </td>
      <td>
        {promoted ? (
          <span className="num text-[12.5px]">{promoted}</span>
        ) : (
          <span className="text-[12px] text-[color:var(--ink-5)]">—</span>
        )}
      </td>
      <td className="text-[12px] text-[color:var(--ink-4)]">{run.created_by ?? "—"}</td>
      <td className="text-right">
        {run.status === "failed" && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            title="ลบ run ที่ล้มเหลว"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--ink-4)] hover:bg-[color:var(--danger-bg)] hover:text-[color:var(--danger)] disabled:opacity-40"
          >
            {deleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        )}
      </td>
    </tr>
  );
}
