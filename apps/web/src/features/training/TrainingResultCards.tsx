"use client";

import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import { StatusPill } from "@/components/ui";
import type { TrainingRun, TrainingRunResult } from "@/lib/mlApi";
import { formatDate } from "./training-utils";
import { MODEL_TYPE_LABELS, beatsBaseline, formatMetric } from "./training-run-utils";

/** Result summary cards for the latest completed training run (spec §2.6.2). */
export function TrainingResultCards({ run }: { run: TrainingRun }) {
  if (!run.results || run.results.length === 0) return null;

  return (
    <section className="surface-elev overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-[color:var(--line-2)] px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-5)]">
            Latest training result
          </p>
          <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[color:var(--ink-1)]">
            {run.dataset_name} · cutoff <span className="num">{run.cutoff_date}</span>
          </h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--ink-5)]">
            เสร็จเมื่อ {formatDate(run.finished_at)}
          </p>
        </div>
        <Link
          href="/model-performance"
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[color:var(--moby-700)] hover:text-[color:var(--moby-800)] hover:underline underline-offset-2"
        >
          ดูรายละเอียด
          <ArrowRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 sm:p-6 lg:grid-cols-3">
        {run.results.map((result) => (
          <ResultCard key={result.model_type} result={result} />
        ))}
      </div>
    </section>
  );
}

function ResultCard({ result }: { result: TrainingRunResult }) {
  const won = beatsBaseline(result);

  return (
    <div className="rounded-[22px] border border-[color:var(--line)] bg-white p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-[color:var(--ink-1)]">
          {MODEL_TYPE_LABELS[result.model_type]}
        </h3>
        {result.promoted ? (
          <StatusPill tone="ok" dot={false} icon={Check}>
            Promoted {result.new_version ?? ""}
          </StatusPill>
        ) : (
          <StatusPill tone="danger" dot={false} icon={X}>
            ไม่ promote
          </StatusPill>
        )}
      </div>

      <p className="mt-2.5 text-[13px] leading-6 text-[color:var(--ink-2)]">
        <span className="font-semibold">
          {result.primary_metric_name}{" "}
          <span className="num">{formatMetric(result.primary_metric_value)}</span>
        </span>{" "}
        — {won ? "ชนะ" : "แพ้"} baseline {result.baseline_name}{" "}
        <span className="num">{formatMetric(result.baseline_value)}</span>
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[color:var(--ink-4)]">
        {result.calibration_ece !== null && (
          <span>
            calibration ECE <span className="num">{formatMetric(result.calibration_ece)}</span>
          </span>
        )}
        <span className={result.leakage_passed ? "text-[color:var(--ok)]" : "text-[color:var(--danger)]"}>
          leakage tests {result.leakage_passed ? "✓" : "✗"}
        </span>
      </div>

      <p className="mt-2.5 border-t border-[color:var(--line-2)] pt-2.5 text-[12px] leading-5 text-[color:var(--ink-4)]">
        {result.promote_reason}
      </p>
    </div>
  );
}
