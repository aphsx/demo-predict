"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Filter, Activity } from "lucide-react";
import {
  PageHeader, SectionCard, StatusPill, Skeleton, EmptyState,
  lifecycleTone,
} from "@/components/ui";
import { fetchPredictions, exportUrl } from "@/lib/api";
import { useRunStore } from "@/lib/runStore";

const STAGES   = ["Active Paid", "Active Free", "Churned", "Ghost"];

function Inner() {
  const router = useRouter();
  const sp     = useSearchParams();
  const { runId } = useRunStore();

  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    lifecycle_stage:  sp.get("lifecycle_stage")  || "",
    search:           sp.get("search")           || "",
  });

  useEffect(() => {
    if (!runId) return;
    setLoading(true);
    const params: any = { page: String(page), page_size: "50" };
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    fetchPredictions(runId, params).then(d => { setData(d); setLoading(false); });
  }, [runId, page, filters]);

  const setFilter = (k: string, v: string) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };
  const clearAll  = () => { setFilters({
    lifecycle_stage:"", search: "",
  }); setPage(1); };

  const rows  = data?.data || [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / 50));
  const activeFilters = Object.entries(filters).filter(([_, v]) => v).length;

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow={`${total.toLocaleString()} customers`}
        title="Customer Intelligence"
        actions={
          <a
            href={exportUrl(runId, Object.fromEntries(Object.entries(filters).filter(([,v]) => v)))}
            className="h-9 px-3 rounded-lg border border-[color:var(--line)] bg-white text-[13px] text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)] inline-flex items-center gap-1.5"
          >
            <Image src="/icons/download.svg" alt="" width={16} height={17} aria-hidden /> Export CSV
          </a>
        }
      />

      <div className="px-8 mt-4 space-y-4">
        {/* Filter Bar */}
        <SectionCard
          title="Filters"
          hint={activeFilters > 0 ? `${activeFilters} filters active` : "ทุกลูกค้าในรอบนี้"}
          right={activeFilters > 0
            ? <button onClick={clearAll} className="text-[12px] text-[color:var(--ink-4)] hover:text-[color:var(--danger)] inline-flex items-center gap-1"><Image src="/icons/clear.svg" alt="" width={12} height={13} aria-hidden /> Clear all</button>
            : <Filter size={14} className="text-[color:var(--ink-5)]" />
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select label="Lifecycle stage" value={filters.lifecycle_stage} onChange={v => setFilter("lifecycle_stage", v)} options={STAGES} />

            <div>
              <label className="text-[11px] font-medium text-[color:var(--ink-4)] block mb-1">Account ID</label>
              <div className="h-9 px-3 rounded-lg border border-[color:var(--line)] bg-white flex items-center gap-2 focus-within:border-[color:var(--moby-300)]">
                <Image src="/icons/search.svg" alt="" width={14} height={14} aria-hidden />
                <input
                  value={filters.search}
                  onChange={e => setFilter("search", e.target.value)}
                  placeholder="Search…"
                  className="bg-transparent outline-none text-[13px] flex-1"
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Table */}
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Lifecycle</th>
                  <th>Churn Prob</th>
                  <th className="text-right">CLV (6m)</th>
                  <th>N Purchases</th>
                  <th>Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                {loading && [...Array(8)].map((_, i) => (
                  <tr key={i}><td colSpan={6}><Skeleton className="h-6 my-1" /></td></tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={6}>
                    <EmptyState title="ไม่พบลูกค้าตามเงื่อนไข" hint="ลองปรับ filter หรือเปลี่ยน run" icon={Activity} />
                  </td></tr>
                )}
                {!loading && rows.map((r: any) => (
                  <tr
                    key={r.acc_id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/customers/${r.acc_id}`)}
                  >
                    <td className="num text-[color:var(--moby-700)] font-medium">{r.acc_id}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <StatusPill tone={lifecycleTone(r.lifecycle_stage)}>{r.lifecycle_stage}</StatusPill>
                        {r.sub_stage && <span className="text-[11px] text-[color:var(--ink-5)]">{r.sub_stage}</span>}
                      </div>
                    </td>
                    <td>
                      {r.churn_probability != null
                        ? `${(r.churn_probability * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="text-right num">
                      {r.predicted_clv_6m != null ? `${Number(r.predicted_clv_6m).toLocaleString()} ฿` : "—"}
                    </td>
                    <td className="num">{r.n_purchases ?? "—"}</td>
                    <td className="num">
                      {r.total_revenue != null ? `${Number(r.total_revenue).toLocaleString()} ฿` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer / pagination */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-[color:var(--line-2)] bg-[color:var(--surface-2)]">
            <div className="text-[12px] text-[color:var(--ink-4)] num">
              {total === 0 ? "0 results" : `${(page - 1) * 50 + 1}–${Math.min(page * 50, total)} of ${total.toLocaleString()}`}
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="h-8 w-8 grid place-items-center rounded-md border border-[color:var(--line)] bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[color:var(--surface-2)]"
              ><ChevronLeft size={14} /></button>
              <span className="text-[12px] text-[color:var(--ink-3)] num">Page {page} / {pages}</span>
              <button
                disabled={page >= pages}
                onClick={() => setPage(p => p + 1)}
                className="h-8 w-8 grid place-items-center rounded-md border border-[color:var(--line)] bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[color:var(--surface-2)]"
              ><ChevronRight size={14} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-[color:var(--ink-4)] block mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-9 px-3 rounded-lg border border-[color:var(--line)] bg-white text-[13px] text-[color:var(--ink-2)] hover:border-[color:var(--moby-200)]"
      >
        <option value="">All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-[color:var(--ink-5)]">Loading…</div>}>
      <Inner />
    </Suspense>
  );
}
