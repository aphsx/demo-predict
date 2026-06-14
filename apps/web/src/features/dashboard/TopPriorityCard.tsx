"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import type { RunSummary } from "@/lib/mlApi";
import {
  LifecycleRowPill,
  MetricCell,
  TOP_PRIORITY_ROW_GRID,
  TOP_PRIORITY_ROW_HEADER_GRID,
} from "@/features/customers/customerRowUi";
import { TEXT_SAFE } from "./palette";

/** Top 5 priority customers (spec §2.1) — เรียงตาม priority_score */
export function TopPriorityCard({ summary, runId }: { summary: RunSummary; runId: string }) {
  const router = useRouter();
  const customerHref = (accId: number) => `/customers/${accId}?run=${runId}`;

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

      <div
        className={`grid gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] max-xl:hidden ${TOP_PRIORITY_ROW_HEADER_GRID}`}
      >
        <span>Account</span>
        <span>Lifecycle</span>
        <span>Churn</span>
        <span className="text-right">Score</span>
        <span className="text-right">CLV 6m</span>
      </div>

      <div className="divide-y divide-gray-100">
        {summary.top_priority.map((c) => {
          const churnPct = c.churn_probability != null ? c.churn_probability * 100 : null;

          return (
            <div
              key={c.acc_id}
              role="button"
              tabIndex={0}
              className={`grid w-full cursor-pointer gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50 xl:items-center xl:gap-4 ${TOP_PRIORITY_ROW_GRID}`}
              onClick={() => router.push(customerHref(c.acc_id))}
              onKeyDown={(event) => {
                if (event.key === "Enter") router.push(customerHref(c.acc_id));
              }}
            >
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] xl:hidden">
                  Account
                </p>
                <p className="num text-[18px] font-semibold text-[color:var(--ink-2)]">{c.acc_id}</p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <LifecycleRowPill stage={c.lifecycle_stage ?? "—"} />
              </div>
              <MetricCell
                label="Churn"
                value={churnPct != null ? `${churnPct.toFixed(1)}%` : "—"}
                valueColor="#fc4c02"
              />
              <MetricCell label="Score" value={c.priority_score.toFixed(0)} alignRight />
              <MetricCell
                label="CLV 6m"
                value={c.predicted_clv_6m != null ? formatCurrency(c.predicted_clv_6m) : "—"}
                alignRight
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
