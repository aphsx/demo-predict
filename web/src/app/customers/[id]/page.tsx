"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { fetchRuns, fetchCustomer } from "@/lib/api";
import Badge from "@/components/Badge";

function Card({ title, children, className }: any) {
  return (
    <div className={`bg-white border rounded-lg p-4 ${className || ""}`}>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Stat({ label, value, color, sub }: any) {
  return (
    <div className="mb-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color || "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function Gauge({ value, label, max = 1 }: { value: number; label: string; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct > 60 ? "text-red-600" : pct > 30 ? "text-yellow-600" : "text-green-600";
  const bg = pct > 60 ? "bg-red-500" : pct > 30 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="text-center">
      <p className={`text-3xl font-bold ${color}`}>{(value * 100).toFixed(1)}%</p>
      <div className="w-full h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
        <div className={`h-full rounded-full ${bg}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

export default function Customer360() {
  const params = useParams();
  const sp = useSearchParams();
  const accId = params.id as string;
  const [runs, setRuns] = useState<any[]>([]);
  const [runId, setRunId] = useState(sp.get("run") || "");
  const [c, setC] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => { fetchRuns().then(r => { setRuns(r); if (!runId && r.length) setRunId(r[0].id); }); }, []);
  useEffect(() => {
    if (!runId || !accId) return;
    fetchCustomer(runId, accId).then(setC).catch(() => setError("Customer not found"));
  }, [runId, accId]);

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!c) return <div className="p-6 text-gray-500">Loading...</div>;

  const stage = c.lifecycle_stage;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-white border rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-lg font-bold text-gray-600">
              {String(c.acc_id).slice(-2)}
            </div>
            <div>
              <h1 className="text-xl font-bold">Customer {c.acc_id}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge stage={stage} />
                <span className="text-sm text-gray-500">{c.sub_stage}</span>
                {c.priority_score != null && (
                  <span className="text-sm text-blue-600 font-mono">Priority: {Number(c.priority_score).toFixed(1)}/10</span>
                )}
              </div>
            </div>
          </div>
          <select value={runId} onChange={e => setRunId(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-white">
            {runs.filter(r => r.status === "done").map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        {/* Action recommendation */}
        {c.recommended_action && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
            <span className="font-semibold">Recommended Action: </span>{c.recommended_action}
          </div>
        )}
      </div>

      {/* === ACTIVE PAID === */}
      {stage === "Active Paid" && (
        <div className="grid grid-cols-3 gap-4">
          <Card title="Churn analysis">
            {c.churn_probability != null && <Gauge value={c.churn_probability} label="Churn probability" />}
            <div className="mt-4 space-y-1">
              {[c.risk_factor_1, c.risk_factor_2, c.risk_factor_3].filter(Boolean).map((f: string, i: number) => (
                <p key={i} className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded">{f}</p>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t">
              <Stat label="Revenue at Risk" value={`${Number(c.revenue_at_risk || 0).toLocaleString()} ฿`} color="text-red-600" />
            </div>
          </Card>

          <Card title="CLV & RFM">
            <Stat label="Predicted CLV (6m)" value={`${Number(c.predicted_clv_6m || 0).toLocaleString()} ฿`} color="text-blue-600" />
            {c.clv_ci95_lo != null && (
              <div className="text-xs text-gray-500 mb-3">
                95% CI: {Number(c.clv_ci95_lo).toLocaleString()} – {Number(c.clv_ci95_hi).toLocaleString()} ฿
              </div>
            )}
            <Stat label="P(alive)" value={c.p_alive != null ? `${(c.p_alive * 100).toFixed(1)}%` : "N/A"} />
            {c.rfm_segment && (
              <div className="mt-2">
                <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-medium">
                  {c.rfm_segment}
                </span>
              </div>
            )}
            <Stat label="Purchases" value={c.n_purchases || 0} sub="total transactions before cutoff" />
            <Stat label="Total Revenue" value={`${Number(c.total_revenue || 0).toLocaleString()} ฿`} />
          </Card>

          <Card title="Credit forecast">
            {c.credit_p50 != null ? (
              <>
                <Stat label="Urgency" value={c.urgency || "N/A"}
                  color={c.urgency === "Critical" ? "text-red-600" : c.urgency === "Warning" ? "text-orange-600" : "text-gray-700"} />
                {c.alert_date && <Stat label="Alert Date" value={c.alert_date} sub="start campaign by this date" />}
                <div className="mt-3 space-y-1 text-xs">
                  {[["P10 (Optimistic)", c.credit_p10], ["P25 (Early)", c.credit_p25],
                    ["P50 (Likely)", c.credit_p50], ["P75 (Late)", c.credit_p75],
                    ["P90 (Pessimistic)", c.credit_p90]].map(([label, val]: any) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-mono">{val != null ? `${Number(val).toFixed(0)} days` : "-"}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400">
                {c.n_purchases <= 1 ? "New customer — not enough purchase history" : "No credit forecast available"}
              </p>
            )}
          </Card>
        </div>
      )}

      {/* === CHURNED === */}
      {stage === "Churned" && (
        <div className="grid grid-cols-2 gap-4">
          <Card title="Win-back analysis">
            {c.comeback_probability != null && (
              <Gauge value={c.comeback_probability} label="Comeback probability" />
            )}
            <div className="mt-4">
              <Stat label="Win-back Tier" value={c.winback_tier || "N/A"}
                color={c.winback_tier === "High" ? "text-green-600" : "text-gray-700"} />
              <Stat label="Days Since Last Activity" value={c.days_since_last_activity || "N/A"} sub="days" />
              <Stat label="Ever Paid" value={c.ever_paid ? "Yes" : "No — free user only"} />
              <Stat label="Total Revenue (historical)" value={`${Number(c.total_revenue || 0).toLocaleString()} ฿`} />
            </div>
          </Card>
          <Card title="Win-back action">
            <div className="bg-orange-50 border border-orange-200 rounded p-4 text-sm text-orange-800">
              <p className="font-semibold mb-2">Recommended:</p>
              <p>{c.winback_action || c.recommended_action || "Monitor"}</p>
            </div>
            <div className="mt-4 text-xs text-gray-500 space-y-1">
              <p>Past purchases: {c.n_purchases || 0}</p>
              {c.rfm_segment && <p>Last RFM segment: {c.rfm_segment}</p>}
            </div>
          </Card>
        </div>
      )}

      {/* === ACTIVE FREE === */}
      {stage === "Active Free" && (
        <div className="grid grid-cols-2 gap-4">
          <Card title="Conversion analysis">
            {c.conversion_probability != null && (
              <Gauge value={c.conversion_probability} label="Conversion probability" />
            )}
            <div className="mt-4">
              <Stat label="Conversion Tier" value={c.conversion_tier || "N/A"}
                color={c.conversion_tier === "High" ? "text-green-600" : "text-gray-700"} />
              <Stat label="Days Since Join" value={c.days_since_last_activity || "N/A"} sub="days active" />
            </div>
          </Card>
          <Card title="Conversion action">
            <div className="bg-purple-50 border border-purple-200 rounded p-4 text-sm text-purple-800">
              <p className="font-semibold mb-2">Recommended:</p>
              <p>{c.conversion_action || c.recommended_action || "Engagement campaign"}</p>
            </div>
          </Card>
        </div>
      )}

      {/* === GHOST === */}
      {stage === "Ghost" && (
        <Card title="Ghost account">
          <p className="text-gray-600">This customer signed up but never used the service.</p>
          <div className="mt-4">
            <Stat label="Sub-stage" value={c.sub_stage || "Unknown"} />
            <div className="bg-gray-50 border rounded p-3 mt-3 text-sm text-gray-600">
              <p className="font-semibold mb-1">Recommended:</p>
              <p>{c.recommended_action}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
