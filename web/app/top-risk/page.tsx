import Link from "next/link";
import { RiskBadge } from "@/components/RiskBadge";
import { getActiveRunId } from "@/lib/activeRun";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function getTopRisk(n = 50, runId?: number | null) {
  try {
    const q = runId ? `&run_id=${runId}` : "";
    const res = await fetch(`${API}/api/top-risk?n=${n}${q}`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  } catch (err) {
    console.error("fetch top-risk failed", err);
    return [];
  }
}

const currency = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

export default async function TopRiskPage() {
  const runId = await getActiveRunId();
  const customers = await getTopRisk(50, runId);

  return (
    <div className="space-y-6">
      <div className="glass glass-strong rounded-[20px] px-8 py-8">
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.38em] mb-4"
              style={{ background: "rgba(239,68,68,0.18)", color: "#FCA5A5", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
              High Priority
            </span>
            <h2 className="text-3xl font-bold text-white">Retention Alert List</h2>
            <p className="mt-2 text-slate-400 text-sm">
              ลูกค้า 50 อันดับแรกที่มีโอกาส Churn สูงสุด — เรียงตาม Churn Probability
            </p>
          </div>
          {/* Export Button */}
          <a
            href={`${API}/api/export?sort_by=churn_probability&order=desc`}
            download="churn_top_risk.csv"
            className="shrink-0 inline-flex items-center gap-2 rounded-[10px] border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </a>
        </div>
      </div>

      <div className="glass p-5 sm:p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "rgba(11,25,55,0.08)" }}>
                {["#", "Account ID", "Status", "Churn Prob.", "Risk", "LTV", "RFM Segment", "Risk Factor", "Recommended Action"].map(h => (
                  <th key={h} className="pb-3 pr-4 text-[11px] font-semibold text-slate-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "rgba(11,25,55,0.05)" }}>
              {customers.length > 0 ? (
                customers.map((c: any, i: number) => (
                  <tr key={c.acc_id} className="hover:bg-brand-50/40 transition-colors">
                    <td className="py-3 pr-4 text-slate-400 font-mono text-xs">{i + 1}</td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/customers/${c.acc_id}`}
                        className="font-mono text-brand-600 hover:text-brand-500 hover:underline text-sm font-semibold"
                      >
                        {c.acc_id}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${c.status === "paid"
                        ? "bg-brand-50 text-brand-600 border border-brand-200"
                        : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(c.churn_probability * 100).toFixed(0)}%`,
                              background: c.churn_probability >= 0.6 ? "#FF4D00" : c.churn_probability >= 0.3 ? "#FFAB00" : "#0870FF",
                            }}
                          />
                        </div>
                        <span
                          className="font-mono text-xs font-semibold"
                          style={{ color: c.churn_probability >= 0.6 ? "#FF4D00" : c.churn_probability >= 0.3 ? "#FFAB00" : "#0870FF" }}
                        >
                          {(c.churn_probability * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4"><RiskBadge risk={c.risk ?? "High"} /></td>
                    <td className="py-3 pr-4 text-slate-700 text-xs font-semibold">
                      {currency.format(c.ltv ?? c.total_amount_paid ?? 0)}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-brand-50 border border-brand-200 px-2.5 py-0.5 text-[10px] font-semibold text-brand-600 whitespace-nowrap">
                        {c.rfm_segment ?? "-"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-500 text-xs max-w-[200px]">
                      {c.risk_factor ?? "-"}
                    </td>
                    <td className="py-3 text-slate-600 text-xs font-medium whitespace-nowrap">
                      {c.recommended_action ?? "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400 font-medium">
                    ไม่พบข้อมูลลูกค้ากลุ่มเสี่ยงสูง
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
