"use client";
/**
 * Training history — one row per training run (all runs, newest first).
 * Shows status, creator, cutoff/horizon, when it ran, duration, and the
 * gate/promotion outcome. Full champion metrics live in ModelStatusCards
 * and /model-performance; there is no per-run detail page.
 */

import { History } from "lucide-react";
import { EmptyState, ProgressMeter, SectionCard, Skeleton, StatusPill } from "@/components/ui";
import type { TrainingRun } from "@/lib/ml-api";
import { formatRelative } from "@/features/runs/runs-utils";
import {
  primaryResultSummary,
  promotedSummary,
  runStatusLabel,
  runStatusTone,
} from "./training-run-utils";
import { getTimestamp } from "./training-utils";

/** "1 ชม. 12 นาที" / "12 นาที" / "45 วิ" — duration between start and finish. */
function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "—";
  const ms = getTimestamp(finishedAt) - getTimestamp(startedAt);
  if (ms <= 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} วิ`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} นาที`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชม.`;
}

function GateResultCell({ run }: { run: TrainingRun }) {
  if (run.status === "failed") {
    return (
      <span
        className="block max-w-[260px] truncate text-[11.5px] text-[color:var(--danger)]"
        title={run.error_message ?? undefined}
      >
        {run.error_message ?? "ล้มเหลว"}
      </span>
    );
  }
  if (run.status !== "completed") {
    return <span className="text-[color:var(--ink-5)]">—</span>;
  }
  const promoted = promotedSummary(run.results);
  const primary = primaryResultSummary(run.results);
  if (!promoted && !primary) {
    return <span className="text-[color:var(--ink-5)]">ไม่มีผลลัพธ์</span>;
  }
  return (
    <div className="min-w-0">
      {promoted && <div className="font-medium text-[color:var(--ink-2)]">{promoted}</div>}
      {primary && <div className="text-[11.5px] text-[color:var(--ink-5)]">{primary}</div>}
    </div>
  );
}

export function TrainingHistoryTable({
  runs,
  loading,
}: {
  runs: TrainingRun[];
  loading: boolean;
}) {
  return (
    <SectionCard
      eyebrow="Training history"
      title="ประวัติการเทรนทั้งหมด"
      hint="หนึ่งแถวต่อหนึ่งรอบเทรน — ใหม่สุดอยู่บน ผล gate/promotion อยู่คอลัมน์ขวา"
    >
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={History}
          title="ยังไม่มี training run"
          hint="เลือก dataset ที่ Ready แล้วกด เทรน ด้านบน"
        />
      ) : (
        <div className="overflow-x-auto rounded-[22px] border border-gray-200">
          <table className="table-base">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Status</th>
                <th>โดย</th>
                <th>Cutoff</th>
                <th>เมื่อไหร่</th>
                <th className="text-right">ใช้เวลา</th>
                <th>ผล gate</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const inProgress = run.status === "in_progress";
                return (
                  <tr key={run.id}>
                    <td>
                      <div className="font-medium text-[color:var(--ink-1)]">{run.dataset_name}</div>
                      <div className="text-[11.5px] text-[color:var(--ink-5)]">
                        horizon {run.horizon_days} วัน
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1.5">
                        <StatusPill tone={runStatusTone(run.status)} loading={inProgress}>
                          {runStatusLabel(run.status)}
                        </StatusPill>
                        {inProgress && run.progress && (
                          <div className="max-w-[200px]">
                            <ProgressMeter value={run.progress.pct} label={run.progress.phase} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="text-[color:var(--ink-3)]">{run.created_by_name ?? "—"}</td>
                    <td className="num text-[color:var(--ink-3)]">{run.cutoff_date}</td>
                    <td className="text-[color:var(--ink-3)]">{formatRelative(run.started_at)}</td>
                    <td className="num text-right text-[color:var(--ink-3)]">
                      {formatDuration(run.started_at, run.finished_at)}
                    </td>
                    <td>
                      <GateResultCell run={run} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
