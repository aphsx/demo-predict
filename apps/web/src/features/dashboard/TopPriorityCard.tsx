"use client";
import Link from "next/link";
import { StatusPill, lifecycleTone } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import type { RunSummary } from "@/lib/mlApi";
import { TEXT_SAFE } from "./palette";

/** Top 10 priority customers (spec §2.1) — เรียงตาม priority_score */
export function TopPriorityCard({ summary, runId }: { summary: RunSummary; runId: string }) {
  return (
    <section className="surface-elev overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-5">
        <div>
          <h2 className={`type-section-title text-[20px] leading-tight ${TEXT_SAFE}`}>
            Top priority customers
          </h2>
          <p className="mt-0.5 text-[11.5px] text-[color:var(--ink-5)]">
            เรียงตามเงินที่เสี่ยงจะเสีย (revenue at risk = ความเสี่ยง churn × มูลค่า CLV)
          </p>
        </div>
        <Link
          href={`/customers?run=${runId}`}
          className="shrink-0 text-[12px] font-medium text-[color:var(--ink-3)] hover:text-[color:var(--moby-600)] hover:underline underline-offset-2"
        >
          ดูทั้งหมด →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-[.08em] text-[color:var(--ink-5)]">
              <th className="px-4 py-2.5 sm:px-5">Account</th>
              <th className="px-3 py-2.5">Lifecycle</th>
              <th className="px-3 py-2.5 text-right">Churn</th>
              <th className="px-3 py-2.5 text-right">CLV 6m</th>
              <th className="px-3 py-2.5 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {summary.top_priority.map((c) => (
              <tr key={c.acc_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5 sm:px-5">
                  <Link
                    href={`/customers/${c.acc_id}?run=${runId}`}
                    className="num font-medium text-[color:var(--ink-2)] hover:underline underline-offset-2"
                  >
                    {c.acc_id}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={lifecycleTone(c.lifecycle_stage)}>{c.lifecycle_stage}</StatusPill>
                </td>
                <td className="num px-3 py-2.5 text-right">
                  {c.churn_probability === null ? "—" : `${(c.churn_probability * 100).toFixed(1)}%`}
                </td>
                <td className="num px-3 py-2.5 text-right">
                  {c.predicted_clv_6m === null ? "—" : formatCurrency(c.predicted_clv_6m)}
                </td>
                <td className="num px-3 py-2.5 text-right">
                  {c.priority_score.toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
