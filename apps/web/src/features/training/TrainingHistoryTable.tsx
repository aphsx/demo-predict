"use client";

import { History } from "lucide-react";
import { EmptyState, ProgressMeter, StatusPill } from "@/components/ui";
import type { TrainingRun } from "@/lib/mlApi";
import { formatDate } from "./training-utils";
import {
  primaryResultSummary,
  promotedSummary,
  runStatusLabel,
  runStatusTone,
} from "./training-run-utils";

/** Training history table (spec §2.6.3). */
export function TrainingHistoryTable({ runs }: { runs: TrainingRun[] }) {
  return (
    <section className="surface-elev overflow-hidden">
      <div className="border-b border-[color:var(--line-2)] px-5 py-4 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-5)]">
          Training history
        </p>
        <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[color:var(--ink-1)]">
          ครั้งที่แล้วเทรนเมื่อไหร่ ด้วย data ไหน
        </h2>
      </div>

      <div className="p-5">
        {runs.length === 0 ? (
          <EmptyState
            icon={History}
            title="ยังไม่เคยเทรน"
            hint="เลือก dataset แล้วกด Train"
          />
        ) : (
          <div className="overflow-x-auto rounded-[22px] border border-[color:var(--line)]">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Dataset</th>
                  <th>Cutoff</th>
                  <th className="text-right">Horizon</th>
                  <th>Status</th>
                  <th>Primary result</th>
                  <th>Promoted</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <HistoryRow key={run.id} run={run} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function HistoryRow({ run }: { run: TrainingRun }) {
  const inProgress = run.status === "in_progress";
  const summary = primaryResultSummary(run.results);
  const promoted = promotedSummary(run.results);

  return (
    <tr>
      <td className="whitespace-nowrap text-[12px] text-[color:var(--ink-3)]">
        {formatDate(run.started_at)}
      </td>
      <td>
        <span className="font-semibold text-[color:var(--ink-1)]">{run.dataset_name}</span>
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
          <span className="num text-[12.5px] text-[color:var(--ink-2)]">{summary}</span>
        ) : (
          <span className="text-[12px] text-[color:var(--ink-5)]">—</span>
        )}
      </td>
      <td>
        {promoted ? (
          <span className="num text-[12.5px] text-[color:var(--ink-2)]">{promoted}</span>
        ) : (
          <span className="text-[12px] text-[color:var(--ink-5)]">—</span>
        )}
      </td>
      <td className="text-[12px] text-[color:var(--ink-4)]">{run.created_by ?? "—"}</td>
    </tr>
  );
}
