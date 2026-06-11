"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { StatusDialog } from "@/components/StatusDialog";
import { Skeleton } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import type { PredictionOutput } from "@/lib/mlApi";

export const STAGES = ["Active Paid", "Active Free", "Churned", "Ghost"];

export type CustomerRow = Pick<
  PredictionOutput,
  | "acc_id"
  | "lifecycle_stage"
  | "sub_stage"
  | "churn_probability"
  | "predicted_clv_6m"
  | "customer_value_tier"
  | "n_purchases"
  | "total_revenue"
>;

export interface CustomerFilters {
  lifecycle_stage: string;
  search: string;
  customer_value_tier: string;
  churn_risk_level: string;
}

const EMPTY_FILTERS: CustomerFilters = {
  lifecycle_stage: "",
  search: "",
  customer_value_tier: "",
  churn_risk_level: "",
};

type AiGenerationStatus = "generating" | "generated";

interface CustomersViewProps {
  rows: CustomerRow[];
  total: number;
  pending: boolean;
  runId: string;
  filters: CustomerFilters;
  onFiltersChange: (filters: CustomerFilters) => void;
}

function Inner({ rows, total, pending, runId, filters, onFiltersChange }: CustomersViewProps) {
  const router = useRouter();

  const [aiGeneration, setAiGeneration] = useState<Record<number, AiGenerationStatus>>({});
  const [pendingOverwriteAccId, setPendingOverwriteAccId] = useState<number | null>(null);

  const setFilter = (key: keyof CustomerFilters, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };
  const clearAll = () => onFiltersChange(EMPTY_FILTERS);

  const startAiGeneration = (accId: number) => {
    setAiGeneration(current => ({ ...current, [accId]: "generating" }));
    window.setTimeout(() => {
      setAiGeneration(current => ({ ...current, [accId]: "generated" }));
    }, 3000);
  };
  const generateReason = (event: MouseEvent<HTMLButtonElement>, accId: number) => {
    event.stopPropagation();
    if (aiGeneration[accId] === "generated") {
      setPendingOverwriteAccId(accId);
      return;
    }

    startAiGeneration(accId);
  };

  const activeFilters = Object.entries(filters).filter(([_, value]) => value).length;
  const pendingRows = pending;
  const customerHref = (accId: number) => {
    const params = new URLSearchParams({ run: runId });
    Object.entries(filters).forEach(([key, value]) => {
      const trimmed = value.trim();
      if (trimmed) params.set(key, trimmed);
    });
    return `/customers/${accId}?${params.toString()}`;
  };

  return (
    <main className="px-8 py-6 pb-12">
        <section className="surface-elev overflow-hidden">
          <div className="border-b border-gray-100 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 focus-within:border-[color:var(--moby-200)]">
                <Search size={15} className="text-[color:var(--ink-5)]" />
                <input
                  value={filters.search}
                  onChange={event => setFilter("search", event.target.value)}
                  placeholder="Search account ID..."
                  className="h-11 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[color:var(--ink-5)]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FilterChip active={!filters.lifecycle_stage} onClick={() => setFilter("lifecycle_stage", "")}>
                  All
                </FilterChip>
                {STAGES.map((stage) => (
                  <FilterChip
                    key={stage}
                    active={filters.lifecycle_stage === stage}
                    onClick={() => setFilter("lifecycle_stage", stage)}
                  >
                    {stage}
                  </FilterChip>
                ))}
                {filters.customer_value_tier && (
                  <FilterChip active onClick={() => setFilter("customer_value_tier", "")}>
                    Tier: {filters.customer_value_tier} ✕
                  </FilterChip>
                )}
                {filters.churn_risk_level && (
                  <FilterChip active onClick={() => setFilter("churn_risk_level", "")}>
                    Risk: {filters.churn_risk_level} ✕
                  </FilterChip>
                )}
                {activeFilters > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold text-[color:var(--ink-4)] hover:bg-gray-50 hover:text-[color:var(--danger)]"
                  >
                    <RotateCcw size={13} /> Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[minmax(180px,1.1fr)_minmax(220px,1.4fr)_120px_150px_150px_120px] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] max-xl:hidden">
            <div>Account</div>
            <div>Lifecycle</div>
            <div>Churn</div>
            <div className="text-right">CLV 6m</div>
            <div className="text-right">Revenue</div>
            <div className="text-right">AI</div>
          </div>

          <div className="divide-y divide-gray-100">
            {pendingRows && [...Array(8)].map((_, i) => (
              <div key={i} className="px-5 py-4"><Skeleton className="h-10" /></div>
            ))}
            {!pendingRows && rows.map((r) => {
              const aiStatus = aiGeneration[r.acc_id];
              const churnPct = r.churn_probability != null ? r.churn_probability * 100 : null;

              return (
                <div
                  key={r.acc_id}
                  role="button"
                  tabIndex={0}
                  className="grid w-full cursor-pointer grid-cols-1 gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50 xl:grid-cols-[minmax(180px,1.1fr)_minmax(220px,1.4fr)_120px_150px_150px_120px] xl:items-center xl:gap-4"
                  onClick={() => router.push(customerHref(r.acc_id))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") router.push(customerHref(r.acc_id));
                  }}
                >
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] xl:hidden">Account</p>
                    <div className="flex items-center gap-2">
                      <p className="num text-[18px] font-semibold text-[color:var(--ink-2)]">{r.acc_id}</p>
                      {isHighValueTier(r.customer_value_tier) ? <HighValueMedal /> : null}
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-[color:var(--ink-5)]">
                      {r.n_purchases ?? 0} purchases
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <LifecycleRowPill stage={r.lifecycle_stage ?? "—"} />
                    {r.sub_stage && <span className="truncate text-[12px] text-[color:var(--ink-4)]">{r.sub_stage}</span>}
                  </div>
                  <MetricCell
                    label="Churn"
                    value={churnPct != null ? `${churnPct.toFixed(1)}%` : "—"}
                    valueColor="#fc4c02"
                  />
                  <MetricCell label="CLV 6m" value={r.predicted_clv_6m != null ? formatCurrency(r.predicted_clv_6m) : "—"} alignRight />
                  <MetricCell label="Revenue" value={r.total_revenue != null ? formatCurrency(r.total_revenue) : "—"} alignRight />
                  <div className="flex justify-start xl:justify-end">
                    <button
                      type="button"
                      disabled={aiStatus === "generating"}
                      onClick={(event) => generateReason(event, r.acc_id)}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[color:var(--moby-600)] px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-[color:var(--moby-800)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {aiStatus === "generating" ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Sparkles size={13} />
                      )}
                      {aiStatus === "generating" ? "Generating" : aiStatus === "generated" ? "Generated" : "Gen AI"}
                    </button>
                  </div>
                </div>
              );
            })}
            {!pendingRows && rows.length === 0 && (
              <div className="px-5 py-12 text-center">
                <p className="text-[15px] font-semibold text-[color:var(--ink-2)]">No customers match this view</p>
                <p className="mt-1 text-[13px] text-[color:var(--ink-4)]">Reset filters or search another account ID.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-3">
            <div className="num text-[12px] text-[color:var(--ink-4)]">
              {pendingRows
                ? "Loading customers..."
                : `${rows.length.toLocaleString()} shown of ${total.toLocaleString()} matching`}
            </div>
            <div className="num text-[12px] text-[color:var(--ink-4)]">
              {total > rows.length ? "showing top results by priority" : ""}
            </div>
          </div>
        </section>

      {pendingOverwriteAccId != null && (
        <StatusDialog
          open
          tone="warning"
          title="AI data มีอยู่แล้ว"
          message={`Account ${pendingOverwriteAccId} มี reason จาก AI อยู่แล้ว ต้องการ generate ใหม่และเขียนทับข้อมูลเดิมไหม?`}
          confirmLabel="เขียนทับ"
          cancelLabel="ยกเลิก"
          onCancel={() => setPendingOverwriteAccId(null)}
          onConfirm={() => {
            startAiGeneration(pendingOverwriteAccId);
            setPendingOverwriteAccId(null);
          }}
        />
      )}
    </main>
  );
}

function MetricCell({
  label,
  value,
  alignRight = false,
  valueColor,
}: {
  label: string;
  value: string;
  alignRight?: boolean;
  valueColor?: string;
}) {
  return (
    <div className={alignRight ? "xl:text-right" : undefined}>
      <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)] xl:hidden">
        {label}
      </p>
      <p
        className="num mt-0.5 text-[14px] font-semibold xl:mt-0"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function LifecycleRowPill({ stage }: { stage: string }) {
  return (
    <span
      className="inline-flex h-[26px] w-[92px] items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{ backgroundColor: lifecycleButtonColor(stage) }}
    >
      {stage}
    </span>
  );
}

function lifecycleButtonColor(stage: string): string {
  if (stage === "Active Paid") return "#006bff";
  if (stage === "Active Free") return "#ffa400";
  if (stage === "Churned") return "#fc4c02";
  if (stage === "Ghost") return "#9ca3af";
  return "#9ca3af";
}

function isHighValueTier(tier: string | null): boolean {
  return (tier ?? "").toLowerCase().includes("high");
}

function HighValueMedal() {
  return (
    <img
      src="/assets/images/achievement-award-medal-icon.svg"
      alt="High value customer"
      className="h-5 w-5 shrink-0"
    />
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center rounded-xl border px-3 text-[12px] font-semibold transition-colors ${
        active
          ? "border-[color:var(--moby-100)] bg-[color:var(--moby-50)] text-[color:var(--moby-600)]"
          : "border-gray-200 bg-white text-[color:var(--ink-4)] hover:bg-gray-50 hover:text-[color:var(--ink-2)]"
      }`}
    >
      {children}
    </button>
  );
}

export function CustomersView(props: CustomersViewProps) {
  return <Inner {...props} />;
}
