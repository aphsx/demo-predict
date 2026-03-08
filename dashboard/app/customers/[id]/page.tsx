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

function FeatureRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: "rgba(11,25,55,0.07)" }}>
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs text-navy-900 font-mono font-medium">{value}</span>
    </div>
  );
}

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const customer = await getCustomer(params.id);
  if (!customer) notFound();

  const prob = customer.churn_probability ?? 0;
  const probPct = (prob * 100).toFixed(2);
  const riskColor = prob >= 0.6 ? "text-red-600" : prob >= 0.3 ? "text-amber-600" : "text-emerald-600";
  const ringColor = prob >= 0.6 ? "#EF4444" : prob >= 0.3 ? "#F59E0B" : "#10B981";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/customers" className="hover:text-brand-600 transition-colors">ลูกค้า</Link>
        <span>/</span>
        <span className="text-navy-900 font-mono font-semibold">{customer.acc_id}</span>
      </div>

      {/* Hero */}
      <div className="glass p-6 flex flex-col md:flex-row gap-6 items-start">
        {/* Gauge */}
        <div className="flex flex-col items-center gap-2 min-w-[160px]">
          <div className="relative w-32 h-32 flex items-center justify-center rounded-full"
            style={{ background: `conic-gradient(${ringColor} ${prob * 360}deg, #EEF3FF 0deg)` }}>
            <div className="absolute inset-2 bg-white rounded-full flex flex-col items-center justify-center">
              <span className={`text-2xl font-bold ${riskColor}`}>{probPct}%</span>
              <span className="text-xs text-slate-400">Churn Prob.</span>
            </div>
          </div>
          <RiskBadge risk={customer.risk ?? (prob >= 0.6 ? "High" : prob >= 0.3 ? "Medium" : "Low")} />
        </div>

        {/* Info */}
        <div className="flex-1 space-y-3">
          <div>
            <h2 className="text-2xl font-bold font-mono text-navy-900">{customer.acc_id}</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              {customer.churned === 1
                ? <span className="text-red-600 font-semibold">● Churned</span>
                : <span className="text-emerald-600 font-semibold">● Active</span>}
              {" · "}
              <span className={customer.status === "paid" ? "text-brand-600 font-semibold" : "text-slate-500"}>
                {customer.status}
              </span>
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Expire", value: customer.expire },
              { label: "Days Inactive", value: `${customer.days_since_last_access} d` },
              { label: "Total Payments", value: customer.total_payments ?? 0 },
              { label: "LTV (Amount Paid)", value: `฿${Number(customer.ltv ?? customer.total_amount_paid ?? 0).toLocaleString()}` },
            ].map((item) => (
              <div key={item.label} className="bg-brand-50 border border-brand-100 rounded-xl p-3">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="text-sm font-semibold text-navy-900 mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Two-col: Features + Payment history chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Model Features */}
        <div className="glass p-5">
          <h3 className="text-sm font-semibold text-navy-900 mb-3">📐 Feature Values (Model Input)</h3>
          <div>
            {[
              ["Account Age", `${customer.account_age_days} days`],
              ["Days Since Last Access", `${customer.days_since_last_access} days`],
              ["Days Until Expire", `${customer.days_until_expire ?? "N/A"} days`],
              ["Total SMS Volume", customer.total_sms_volume ?? 0],
              ["Avg SMS Volume", customer.avg_sms_volume ?? 0],
              ["Avg Amount / Tx", `฿${Number(customer.avg_amount_per_tx ?? 0).toLocaleString()}`],
              ["Last Payment Recency", `${customer.last_payment_recency ?? "N/A"} days`],
              ["Avg Payment Gap", `${customer.avg_payment_gap_days ?? 0} days`],
              ["Unique Products", customer.unique_products ?? 0],
              ["Downgraded", customer.downgraded === 1 ? "Yes" : "No"],
            ].map(([label, value]) => (
              <FeatureRow key={String(label)} label={String(label)} value={value as string | number} />
            ))}
          </div>
        </div>

        {/* Payment Chart */}
        <div className="glass p-5">
          <h3 className="text-sm font-semibold text-navy-900 mb-3">💳 ประวัติการชำระเงิน</h3>
          <PaymentLineChart data={customer.payment_history ?? []} />

          {/* Payment table */}
          {customer.payment_history?.length > 0 && (
            <div className="mt-4 max-h-44 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b text-left" style={{ borderColor: "rgba(11,25,55,0.08)" }}>
                    <th className="pb-2 pr-4 text-slate-400 font-semibold">Date</th>
                    <th className="pb-2 pr-4 text-slate-400 font-semibold">Amount</th>
                    <th className="pb-2 pr-4 text-slate-400 font-semibold">SMS Vol.</th>
                    <th className="pb-2 text-slate-400 font-semibold">Product</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "rgba(11,25,55,0.05)" }}>
                  {customer.payment_history.map((p: any, i: number) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-4 text-slate-500">{p.payment_date?.slice(0, 10)}</td>
                      <td className="py-1.5 pr-4 text-emerald-600 font-semibold">฿{Number(p.amount).toLocaleString()}</td>
                      <td className="py-1.5 pr-4 text-slate-500">{p.sms_volume?.toLocaleString()}</td>
                      <td className="py-1.5 text-slate-400">{p.product_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Churn Prediction Summary */}
      <div className="glass p-5" style={{ borderLeft: `4px solid ${ringColor}` }}>
        <h3 className="text-sm font-semibold text-navy-900 mb-3">🎯 Churn Prediction Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xs text-slate-500">Churn Probability</p>
            <p className={`text-2xl font-bold mt-1 ${riskColor}`}>{probPct}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Prediction</p>
            <p className={`text-2xl font-bold mt-1 ${customer.churn_predicted ? "text-red-600" : "text-emerald-600"}`}>
              {customer.churn_predicted ? "CHURN" : "RETAIN"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Risk Tier</p>
            <p className="mt-1">
              <RiskBadge risk={customer.risk ?? "High"} />
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Actual Status</p>
            <p className={`text-2xl font-bold mt-1 ${customer.churned ? "text-red-400" : "text-emerald-400"}`}>
              {customer.churned ? "CHURNED" : "ACTIVE"}
            </p>
          </div>
        </div>
      </div>

      {/* Customer 360 — RFM + Explainable AI + Recommended Action */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* RFM Segment */}
        <div className="glass p-5 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-navy-900">📊 RFM Segment</h3>
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-3">
            <span className="rounded-full bg-brand-50 border border-brand-200 px-4 py-2 text-sm font-bold text-brand-600">
              {customer.rfm_segment ?? "—"}
            </span>
            <p className="text-xs text-slate-500 text-center mt-1">
              จัดกลุ่มจาก Recency · Frequency · Monetary
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Recency", value: `${customer.days_since_last_access ?? 0} d` },
              { label: "Frequency", value: customer.total_payments ?? 0 },
              { label: "Monetary", value: `฿${Number(customer.ltv ?? customer.total_amount_paid ?? 0).toLocaleString()}` },
            ].map((item) => (
              <div key={item.label} className="bg-slate-50 rounded-lg p-2">
                <p className="text-[10px] text-slate-400">{item.label}</p>
                <p className="text-xs font-semibold text-navy-900 mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Key Reason — Explainable AI */}
        <div className="glass p-5 flex flex-col gap-3" style={{ borderLeft: `3px solid ${ringColor}` }}>
          <h3 className="text-sm font-semibold text-navy-900">🔍 Key Reason (Explainable AI)</h3>
          {customer.risk_factor && customer.risk_factor !== "ปกติ" && (
            <div className="rounded-lg bg-red-50 border border-red-100 p-3">
              <p className="text-[10px] text-red-500 font-semibold uppercase tracking-widest mb-1">Risk Factor</p>
              <p className="text-xs text-red-700 font-medium">{customer.risk_factor}</p>
            </div>
          )}
          {customer.key_reason && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
              <p className="text-[10px] text-amber-600 font-semibold uppercase tracking-widest mb-1">Top Feature Signal</p>
              <p className="text-xs text-amber-800 font-medium leading-relaxed">{customer.key_reason}</p>
            </div>
          )}
          {!customer.risk_factor && !customer.key_reason && (
            <p className="text-xs text-slate-400">ไม่มีข้อมูล</p>
          )}
        </div>

        {/* Recommended Action */}
        <div className="glass p-5 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-navy-900">⚡ Recommended Action</h3>
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-3">
            <div
              className="w-full rounded-xl p-4 text-center"
              style={{
                background: prob >= 0.6 ? "#fff0ea" : prob >= 0.3 ? "#fffaf0" : "#F0FDF4",
                border: `1px solid ${prob >= 0.6 ? "#ffc9b3" : prob >= 0.3 ? "#ffe3b3" : "#A7F3D0"}`,
              }}
            >
              <p className="text-sm font-bold" style={{ color: prob >= 0.6 ? "#cc3d02" : prob >= 0.3 ? "#b37300" : "#047857" }}>
                {customer.recommended_action ?? "ติดตาม Newsletter รายเดือน"}
              </p>
            </div>
            <p className="text-xs text-slate-500 text-center">
              {prob >= 0.6
                ? "ลูกค้ากลุ่มนี้ต้องการการดูแลเร่งด่วน"
                : prob >= 0.3
                  ? "ส่งข้อเสนอพิเศษเพื่อกระตุ้นการใช้งาน"
                  : "ลูกค้ากลุ่มนี้มีความเสี่ยงต่ำ ติดตามปกติ"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
