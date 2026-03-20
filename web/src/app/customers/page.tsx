"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchRuns, fetchPredictions, exportUrl } from "@/lib/api";
import Badge from "@/components/Badge";

const STAGES = ["", "Active Paid", "Active Free", "Churned", "Ghost"];
const CHURN_TIERS = ["", "Low", "Medium", "High"];
const WB_TIERS = ["", "High", "Medium", "Low"];
const CV_TIERS = ["", "High", "Medium", "Low"];

export default function Customers() {
  const router = useRouter();
  const sp = useSearchParams();
  const [runs, setRuns] = useState<any[]>([]);
  const [runId, setRunId] = useState(sp.get("run") || "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [filters, setFilters] = useState({
    lifecycle_stage: "", churn_tier: "", winback_tier: "", conversion_tier: "", search: ""
  });

  useEffect(() => { fetchRuns().then(r => { setRuns(r); if (!runId && r.length) setRunId(r[0].id); }); }, []);

  useEffect(() => {
    if (!runId) return;
    const params: any = { page: String(page), page_size: "50" };
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    fetchPredictions(runId, params).then(setData);
  }, [runId, page, filters]);

  const updateFilter = (key: string, val: string) => {
    setFilters(f => ({ ...f, [key]: val }));
    setPage(1);
  };

  const rows = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Customers</h1>
        <div className="flex items-center gap-2">
          <select value={runId} onChange={e => { setRunId(e.target.value); setPage(1); }}
            className="border rounded px-2 py-1 text-sm bg-white">
            {runs.filter(r => r.status === "done").map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          {runId && (
            <a href={exportUrl(runId, Object.fromEntries(Object.entries(filters).filter(([,v]) => v)))}
              className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">
              Export CSV
            </a>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filters.lifecycle_stage} onChange={e => updateFilter("lifecycle_stage", e.target.value)}
          className="border rounded px-2 py-1 text-sm bg-white">
          <option value="">All Stages</option>
          {STAGES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(!filters.lifecycle_stage || filters.lifecycle_stage === "Active Paid") && (
          <select value={filters.churn_tier} onChange={e => updateFilter("churn_tier", e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-white">
            <option value="">All Churn</option>
            {CHURN_TIERS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {filters.lifecycle_stage === "Churned" && (
          <select value={filters.winback_tier} onChange={e => updateFilter("winback_tier", e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-white">
            <option value="">All Win-back</option>
            {WB_TIERS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {filters.lifecycle_stage === "Active Free" && (
          <select value={filters.conversion_tier} onChange={e => updateFilter("conversion_tier", e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-white">
            <option value="">All Conversion</option>
            {CV_TIERS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <input placeholder="Search acc_id..." value={filters.search}
          onChange={e => updateFilter("search", e.target.value)}
          className="border rounded px-2 py-1 text-sm w-40" />
        <span className="text-sm text-gray-500 self-center">{total.toLocaleString()} results</span>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-left text-xs text-gray-500 uppercase">
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Sub</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Key Metric</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.acc_id} className="border-b hover:bg-gray-50 cursor-pointer"
                onClick={() => router.push(`/customers/${r.acc_id}?run=${runId}`)}>
                <td className="px-3 py-2 font-mono text-blue-600">{r.acc_id}</td>
                <td className="px-3 py-2"><Badge stage={r.lifecycle_stage} /></td>
                <td className="px-3 py-2 text-xs text-gray-600">{r.sub_stage}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.lifecycle_stage === "Active Paid" && r.churn_probability != null &&
                    <span className={r.churn_probability > 0.6 ? "text-red-600 font-bold" : ""}>
                      Churn {(r.churn_probability * 100).toFixed(0)}%
                    </span>}
                  {r.lifecycle_stage === "Churned" && r.comeback_probability != null &&
                    <span className="text-orange-600">
                      Comeback {(r.comeback_probability * 100).toFixed(0)}%
                    </span>}
                  {r.lifecycle_stage === "Active Free" && r.conversion_probability != null &&
                    <span className="text-purple-600">
                      Convert {(r.conversion_probability * 100).toFixed(0)}%
                    </span>}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {r.lifecycle_stage === "Active Paid" && r.predicted_clv_6m != null &&
                    `CLV ${Number(r.predicted_clv_6m).toLocaleString()} ฿`}
                  {r.lifecycle_stage === "Active Paid" && r.revenue_at_risk > 0 &&
                    <span className="text-red-500 ml-2">RAR {Number(r.revenue_at_risk).toLocaleString()}</span>}
                </td>
                <td className="px-3 py-2">
                  {r.priority_score != null && (
                    <div className="flex items-center gap-1">
                      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min(100, (r.priority_score / 10) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{Number(r.priority_score).toFixed(1)}</span>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600 max-w-xs truncate">{r.recommended_action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 border rounded text-sm disabled:opacity-30">Prev</button>
          <span className="text-sm text-gray-500">Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 border rounded text-sm disabled:opacity-30">Next</button>
        </div>
      )}
    </div>
  );
}
