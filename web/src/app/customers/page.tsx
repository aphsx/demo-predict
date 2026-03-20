"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import Badge from "@/components/Badge";
import { api, Prediction, Run } from "@/lib/api";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

const CHURN_TIERS  = ["High","Medium","Low","Already Churned"];
const RFM_SEGS     = ["Champions","Loyal","Promising","Cannot Lose","At Risk","Need Attention"];
const URGENCIES    = ["Critical","Warning","Monitor","Stable","New Customer"];

function CustomersContent() {
  const params  = useSearchParams();
  const router  = useRouter();
  const initRun = params.get("run") ?? "";

  const [runs, setRuns]           = useState<Run[]>([]);
  const [runId, setRunId]         = useState(initRun);
  const [data, setData]           = useState<Prediction[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [churnTier, setChurnTier] = useState("");
  const [rfmSeg, setRfmSeg]       = useState("");
  const [urgency, setUrgency]     = useState("");
  const [search, setSearch]       = useState("");

  useEffect(() => { api.listRuns().then(setRuns); }, []);

  useEffect(() => {
    if (!runId) return;
    setLoading(true);
    const p: Record<string,string|number> = { page, page_size: 50 };
    if (churnTier) p.churn_tier = churnTier;
    if (rfmSeg)    p.rfm_segment = rfmSeg;
    if (urgency)   p.urgency = urgency;
    api.getPredictions(runId, p)
       .then(r => { setData(r.data); setTotal(r.total); })
       .finally(() => setLoading(false));
  }, [runId, page, churnTier, rfmSeg, urgency]);

  const filtered = search
    ? data.filter(d => String(d.acc_id).includes(search))
    : data;

  const totalPages = Math.ceil(total / 50);

  const pct = (n?: number) => n == null ? "—" : `${(n * 100).toFixed(0)}%`;
  const baht = (n?: number) => n == null ? "—" : `฿${Math.round(n).toLocaleString()}`;
  const days = (n?: number) => n == null ? "—" : `${Math.round(n)} วัน`;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold">รายชื่อลูกค้า</h1>
              <p className="text-sm text-gray-500">
                {total > 0 ? `${total.toLocaleString()} รายการ` : "เลือก Run เพื่อดูข้อมูล"}
              </p>
            </div>
            <select className="text-sm border rounded-lg px-3 py-2"
                    value={runId} onChange={e => { setRunId(e.target.value); setPage(1); }}>
              <option value="">-- เลือก Run --</option>
              {runs.filter(r => r.status === "done").map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                     placeholder="ค้นหา acc_id..."
                     className="pl-8 pr-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-36" />
            </div>
            <select value={churnTier} onChange={e => { setChurnTier(e.target.value); setPage(1); }}
                    className="text-sm border rounded-lg px-3 py-1.5">
              <option value="">Churn Tier ทั้งหมด</option>
              {CHURN_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={rfmSeg} onChange={e => { setRfmSeg(e.target.value); setPage(1); }}
                    className="text-sm border rounded-lg px-3 py-1.5">
              <option value="">RFM ทั้งหมด</option>
              {RFM_SEGS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={urgency} onChange={e => { setUrgency(e.target.value); setPage(1); }}
                    className="text-sm border rounded-lg px-3 py-1.5">
              <option value="">Urgency ทั้งหมด</option>
              {URGENCIES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            {(churnTier || rfmSeg || urgency) && (
              <button onClick={() => { setChurnTier(""); setRfmSeg(""); setUrgency(""); }}
                      className="text-sm text-blue-600 hover:underline px-2">
                ล้างตัวกรอง
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="p-6">
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["acc_id","Churn %","Tier","CLV 6m","P(alive)","RFM Segment",
                      "P50 (วัน)","Urgency","Alert Date","Priority","Revenue Risk"].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading && (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">
                      กำลังโหลด...
                    </td></tr>
                  )}
                  {!loading && filtered.map(d => (
                    <tr key={d.acc_id}
                        className="hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={() => router.push(`/customers/${d.acc_id}?run=${runId}`)}>
                      <td className="px-3 py-2.5 font-mono font-medium text-blue-700">
                        {d.acc_id}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full"
                                 style={{
                                   width: `${(d.churn_probability ?? 0) * 100}%`,
                                   background: (d.churn_probability ?? 0) > 0.6 ? "#ef4444"
                                             : (d.churn_probability ?? 0) > 0.3 ? "#f59e0b"
                                             : "#22c55e"
                                 }} />
                          </div>
                          <span className="text-xs text-gray-600">{pct(d.churn_probability)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><Badge label={d.churn_tier ?? "—"} /></td>
                      <td className="px-3 py-2.5 text-right font-medium">{baht(d.predicted_clv_6m)}</td>
                      <td className="px-3 py-2.5 text-center">{pct(d.p_alive)}</td>
                      <td className="px-3 py-2.5"><Badge label={d.rfm_segment ?? "—"} /></td>
                      <td className="px-3 py-2.5 text-center">{days(d.credit_p50)}</td>
                      <td className="px-3 py-2.5"><Badge label={d.urgency ?? "—"} /></td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{d.alert_date ?? "—"}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`font-semibold text-sm ${
                          (d.priority_score ?? 0) > 7 ? "text-red-600"
                        : (d.priority_score ?? 0) > 4 ? "text-orange-500"
                        : "text-gray-600"
                        }`}>
                          {d.priority_score?.toFixed(1) ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{baht(d.revenue_at_risk)}</td>
                    </tr>
                  ))}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-400">
                      {runId ? "ไม่พบข้อมูล" : "เลือก Run ก่อน"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  หน้า {page} จาก {totalPages} ({total.toLocaleString()} รายการ)
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                          className="p-1.5 rounded border hover:bg-gray-50 disabled:opacity-40">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                          className="p-1.5 rounded border hover:bg-gray-50 disabled:opacity-40">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function CustomersPage() {
  return <Suspense><CustomersContent /></Suspense>;
}
