import Link from "next/link";
import { notFound } from "next/navigation";
import { RiskBadge } from "@/components/RiskBadge";
import PaymentLineChart from "@/components/PaymentLineChart";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function getCustomer(accId: string) {
  const res = await fetch(`${API}/api/predictions/${accId}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${(score / 10) * 100}%`, background: color }}
      />
    </div>
  );
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const prob = customer.churn_probability ?? 0;
  const probPct = (prob * 100).toFixed(1);
  const riskColor = prob >= 0.6 ? "#EF4444" : prob >= 0.3 ? "#F59E0B" : "#10B981";
  const riskBg = prob >= 0.6 ? "#FEF2F2" : prob >= 0.3 ? "#FFFBEB" : "#F0FDF4";
  const risk = customer.risk ?? (prob >= 0.6 ? "High" : prob >= 0.3 ? "Medium" : "Low");
  const initials = customer.acc_id.slice(0, 2).toUpperCase();
  const ltv = Number(customer.ltv ?? customer.total_amount_paid ?? 0);

  // Compute Churn Risk Factor scores (0–10, higher = more concern)
  function clamp(v: number) { return Math.max(0, Math.min(10, v)); }
  const factors = [
    {
      label: "Activity Rate",
      score: parseFloat(clamp((customer.days_since_last_access ?? 0) / 18).toFixed(1)),
      description: (customer.days_since_last_access ?? 0) > 90
        ? `Inactive ${customer.days_since_last_access} days`
        : `Last seen ${customer.days_since_last_access} days ago`,
    },
    {
      label: "Product Usage",
      score: parseFloat(clamp(10 - (customer.unique_products ?? 1) * 2).toFixed(1)),
      description: `Using ${customer.unique_products ?? 1} product type${(customer.unique_products ?? 1) !== 1 ? "s" : ""}`,
    },
    {
      label: "Payment Gap",
      score: parseFloat(clamp((customer.avg_payment_gap_days ?? 0) / 10).toFixed(1)),
      description: `Avg ${Math.round(customer.avg_payment_gap_days ?? 0)} days between payments`,
    },
    {
      label: "Contract Risk",
      score: parseFloat(clamp(10 - (customer.days_until_expire ?? 30) / 15).toFixed(1)),
      description: (customer.days_until_expire ?? 0) <= 0
        ? "Contract already expired"
        : `Expires in ${customer.days_until_expire} days`,
    },
    {
      label: "Payment Recency",
      score: parseFloat(clamp((customer.last_payment_recency ?? 0) / 10).toFixed(1)),
      description: (customer.last_payment_recency ?? 0) < 30
        ? "Recent payment activity"
        : `${customer.last_payment_recency} days since last payment`,
    },
    {
      label: "Revenue Trend",
      score: parseFloat(clamp(10 - (customer.avg_amount_per_tx ?? 0) / 500).toFixed(1)),
      description: `Avg ฿${Number(customer.avg_amount_per_tx ?? 0).toFixed(0)} / transaction`,
    },
  ];

  function factorColor(s: number) {
    return s >= 7 ? "#EF4444" : s >= 4 ? "#F59E0B" : "#10B981";
  }

  const riskScore = parseFloat((prob * 10).toFixed(1));

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/customers" className="hover:text-blue-600 transition-colors flex items-center gap-1">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Customer Details
        </Link>
      </div>

      {/* ── Hero: Left profile + Right Churn Risk Factors ── */}
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-5">

        {/* LEFT — Profile Card */}
        <div className="bg-white rounded-[20px] border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.05)] p-7 flex flex-col gap-5">
          {/* Avatar + Name */}
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
              style={{ background: "linear-gradient(135deg, #005AE2 0%, #38BDF8 100%)" }}
            >
              {initials}
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 font-mono">{customer.acc_id}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${customer.status === "paid" ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-gray-100 text-gray-500"}`}>
                  {customer.status}
                </span>
                {customer.churned === 1
                  ? <span className="text-xs text-red-500 font-semibold">● Churned</span>
                  : <span className="text-xs text-emerald-500 font-semibold">● Active</span>}
              </div>
            </div>
          </div>

          {/* Info rows — icon-based list like the screenshot */}
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              <span>Joined {customer.join_date?.slice(0, 10) ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
              <span>฿{ltv.toLocaleString()} total revenue</span>
            </div>
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              <span>Last active {customer.last_access?.slice(0, 10) ?? `${customer.days_since_last_access} days ago`}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              <span>Expires {customer.expire?.slice(0, 10) ?? "—"}</span>
            </div>
          </div>

          {/* Churn Risk Score — shown as 0-10 scale like screenshot */}
          <div className="text-center">
            <p className="text-4xl font-black" style={{ color: riskColor }}>{riskScore}</p>
            <p className="text-xs text-gray-400 mt-1">Churn Risk Score</p>
          </div>

          {/* Action buttons */}
          <div className="space-y-2.5">
            <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Send Alert to Sales Rep
            </button>
            <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] bg-gray-900 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Create Intervention
            </button>
          </div>
        </div>

        {/* RIGHT — Churn Risk Factors */}
        <div className="bg-white rounded-[20px] border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.05)] p-7">
          <h3 className="text-lg font-bold text-gray-900 mb-5">Churn Risk Factors</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
            {factors.map((f) => {
              const color = factorColor(f.score);
              const bgTint = f.score >= 7 ? "#FEF2F2" : f.score >= 4 ? "#FFFBEB" : "#F0FDF4";
              return (
                <div key={f.label}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-800">{f.label}</span>
                    <span className="text-lg font-bold" style={{ color }}>{f.score}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ background: bgTint }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(f.score / 10) * 100}%`, background: color }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">{f.description}</p>
                </div>
              );
            })}
          </div>

          {/* Summary row */}
          <div className="mt-7 pt-5 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Churn Probability", value: `${probPct}%`, color: riskColor },
              { label: "Prediction", value: customer.churn_predicted ? "CHURN" : "RETAIN", color: customer.churn_predicted ? "#EF4444" : "#10B981" },
              { label: "Risk Tier", value: risk, color: riskColor },
              { label: "Actual Status", value: customer.churned ? "CHURNED" : "ACTIVE", color: customer.churned ? "#F87171" : "#34D399" },
            ].map((item) => (
              <div key={item.label} className="text-center rounded-[12px] bg-gray-50 p-3">
                <p className="text-[10px] text-gray-400 mb-1">{item.label}</p>
                <p className="text-base font-bold" style={{ color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* RFM + Key Reason + Action */}
          {(customer.rfm_segment || customer.risk_factor || customer.recommended_action) && (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {customer.rfm_segment && (
                <div className="rounded-[12px] bg-blue-50 border border-blue-100 p-3.5">
                  <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-1">RFM Segment</p>
                  <p className="text-sm font-bold text-blue-700">{customer.rfm_segment}</p>
                  <p className="text-[11px] text-blue-400 mt-1">Recency · Frequency · Monetary</p>
                </div>
              )}
              {customer.risk_factor && customer.risk_factor !== "ปกติ" && (
                <div className="rounded-[12px] bg-red-50 border border-red-100 p-3.5">
                  <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-1">Key Risk Factor</p>
                  <p className="text-xs font-semibold text-red-700 leading-relaxed">{customer.risk_factor}</p>
                </div>
              )}
              {customer.recommended_action && (
                <div className="rounded-[12px] p-3.5" style={{ background: prob >= 0.6 ? "#fff5f0" : prob >= 0.3 ? "#fffbf0" : "#f0fdf4", border: `1px solid ${riskColor}30` }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: riskColor }}>Recommended Action</p>
                  <p className="text-xs font-semibold leading-relaxed" style={{ color: riskColor }}>{customer.recommended_action}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom: Feature Values + Payment History ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Model Features */}
        <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Feature Values (Model Input)</h3>
          <div className="space-y-0">
            {[
              ["Account Age", `${customer.account_age_days} days`],
              ["Days Since Last Access", `${customer.days_since_last_access} days`],
              ["Days Until Expire", `${customer.days_until_expire ?? "N/A"} days`],
              ["Total SMS Volume", (customer.total_sms_volume ?? 0).toLocaleString()],
              ["Avg SMS Volume", (customer.avg_sms_volume ?? 0).toFixed(1)],
              ["Avg Amount / Tx", `฿${Number(customer.avg_amount_per_tx ?? 0).toLocaleString()}`],
              ["Last Payment Recency", `${customer.last_payment_recency ?? "N/A"} days`],
              ["Avg Payment Gap", `${customer.avg_payment_gap_days ?? 0} days`],
              ["Unique Products", customer.unique_products ?? 0],
              ["Downgraded", customer.downgraded === 1 ? "Yes" : "No"],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-xs text-gray-500">{label}</span>
                <span className="text-xs font-mono font-semibold text-gray-800">{value as string | number}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment History */}
        <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">ประวัติการชำระเงิน</h3>
          <PaymentLineChart data={customer.payment_history ?? []} />
          {customer.payment_history?.length > 0 && (
            <div className="mt-4 max-h-44 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-100 text-left">
                    <th className="pb-2 pr-4 text-gray-400 font-semibold">Date</th>
                    <th className="pb-2 pr-4 text-gray-400 font-semibold">Amount</th>
                    <th className="pb-2 pr-4 text-gray-400 font-semibold">SMS Vol.</th>
                    <th className="pb-2 text-gray-400 font-semibold">Product</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {customer.payment_history.map((p: any, i: number) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-4 text-gray-500">{p.payment_date?.slice(0, 10)}</td>
                      <td className="py-1.5 pr-4 text-emerald-600 font-semibold">฿{Number(p.amount).toLocaleString()}</td>
                      <td className="py-1.5 pr-4 text-gray-500">{p.sms_volume?.toLocaleString()}</td>
                      <td className="py-1.5 text-gray-400">{p.product_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
