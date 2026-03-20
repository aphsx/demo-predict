"use client";
import { useEffect, useState } from "react";
import { fetchRuns, fetchSummary } from "@/lib/api";

function KPI({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function StageCard({ title, count, sub, children, color }: any) {
  return (
    <div className={`rounded-lg border-l-4 bg-white border p-4 ${color}`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{(count || 0).toLocaleString()}</p>
        </div>
      </div>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      {children}
    </div>
  );
}

function DistBar({ data, colors }: { data: Record<string, number>; colors: Record<string, string> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (
    <div className="mt-3">
      <div className="flex rounded-full overflow-hidden h-3">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} style={{ width: `${(v / total) * 100}%` }}
            className={`${colors[k] || "bg-gray-300"}`} title={`${k}: ${v}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-2">
        {Object.entries(data).map(([k, v]) => (
          <span key={k} className="text-xs text-gray-600">
            <span className={`inline-block w-2 h-2 rounded-full mr-1 ${colors[k] || "bg-gray-300"}`}></span>
            {k}: {v.toLocaleString()}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [runs, setRuns] = useState<any[]>([]);
  const [runId, setRunId] = useState("");
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchRuns().then(r => { setRuns(r); if (r.length) setRunId(r[0].id); }); }, []);
  useEffect(() => {
    if (!runId) return;
    setLoading(true);
    fetchSummary(runId).then(s => { setSummary(s); setLoading(false); });
    const run = runs.find(r => r.id === runId);
    if (run?.status === "processing") {
      const t = setInterval(() => fetchSummary(runId).then(setSummary), 5000);
      return () => clearInterval(t);
    }
  }, [runId]);

  const s = summary;
  const ap = s?.active_paid || {};
  const wb = s?.winback || {};
  const cv = s?.conversion || {};
  const lc = s?.lifecycle || {};

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <select value={runId} onChange={e => setRunId(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white">
          {runs.filter(r => r.status === "done").map(r => (
            <option key={r.id} value={r.id}>{r.name} ({r.cutoff_date})</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {!loading && s && (
        <>
          {/* Lifecycle Overview */}
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Customer Lifecycle</h2>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StageCard title="Active Paid" count={lc["Active Paid"]?.total} color="border-l-blue-500"
              sub={`Healthy ${ap.healthy || 0} • At Risk ${ap.at_risk || 0}`}>
              <p className="text-xs text-red-600 mt-2 font-medium">
                Revenue at Risk: {Number(ap.revenue_at_risk || 0).toLocaleString()} ฿
              </p>
            </StageCard>
            <StageCard title="Active Free" count={lc["Active Free"]?.total} color="border-l-purple-500"
              sub={`High convert: ${cv.high || 0}`}>
              <p className="text-xs text-purple-600 mt-2 font-medium">
                Avg convert: {((cv.avg_convert || 0) * 100).toFixed(1)}%
              </p>
            </StageCard>
            <StageCard title="Churned" count={lc["Churned"]?.total} color="border-l-orange-500"
              sub={`Win-back High: ${wb.high || 0} • Med: ${wb.medium || 0}`}>
              <p className="text-xs text-orange-600 mt-2 font-medium">
                Avg comeback: {((wb.avg_comeback || 0) * 100).toFixed(1)}%
              </p>
            </StageCard>
            <StageCard title="Ghost" count={lc["Ghost"]?.total} color="border-l-gray-400"
              sub={Object.entries(lc["Ghost"]?.sub_stages || {}).map(([k,v]) => `${k}: ${v}`).join(" • ")} />
          </div>

          {/* Active Paid KPIs */}
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Active Paid — Key Metrics</h2>
          <div className="grid grid-cols-5 gap-3 mb-6">
            <KPI label="Total Active Paid" value={(ap.total || 0).toLocaleString()} />
            <KPI label="At Risk" value={(ap.at_risk || 0).toLocaleString()} color="text-red-600" />
            <KPI label="Revenue at Risk" value={`${Number(ap.revenue_at_risk || 0).toLocaleString()} ฿`} color="text-red-600" />
            <KPI label="Avg CLV (6m)" value={`${Number(ap.avg_clv || 0).toLocaleString()} ฿`} />
            <KPI label="Critical Top-up" value={(ap.critical_topup || 0).toLocaleString()} color="text-amber-600" />
          </div>

          {/* Distributions */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Churn Distribution</h3>
              <DistBar data={s.churn_distribution || {}} colors={{
                "Low": "bg-green-400", "Medium": "bg-yellow-400", "High": "bg-red-400"
              }} />
            </div>
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">RFM Segments</h3>
              <DistBar data={s.rfm_distribution || {}} colors={{
                "Champions": "bg-blue-500", "Loyal": "bg-blue-300",
                "Need Attention": "bg-yellow-400", "Promising": "bg-green-400",
                "At Risk": "bg-red-400", "Cannot Lose": "bg-orange-400"
              }} />
            </div>
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Credit Urgency</h3>
              <DistBar data={s.urgency_distribution || {}} colors={{
                "Critical": "bg-red-500", "Warning": "bg-orange-400",
                "Monitor": "bg-yellow-300", "Stable": "bg-green-400", "New Customer": "bg-gray-300"
              }} />
            </div>
          </div>

          {/* Action summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-800 mb-2">Actionable Today</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-blue-600 font-bold text-lg">{ap.at_risk || 0}</p>
                <p className="text-blue-700">Active Paid at risk — call or send offer</p>
              </div>
              <div>
                <p className="text-orange-600 font-bold text-lg">{wb.high || 0}</p>
                <p className="text-orange-700">Churned High tier — win-back call</p>
              </div>
              <div>
                <p className="text-purple-600 font-bold text-lg">{cv.high || 0}</p>
                <p className="text-purple-700">Free users High tier — conversion offer</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
