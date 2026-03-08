import Link from "next/link";
import { RiskBadge } from "@/components/RiskBadge";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function getTopRisk(n = 50) {
  const res = await fetch(`${API}/api/top-risk?n=${n}`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export default async function TopRiskPage() {
  const customers = await getTopRisk(50);

  return (
    <div className="space-y-6">
      <div className="glass glass-strong rounded-[20px] px-8 py-8">
        <div className="relative">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.38em] mb-4"
            style={{ background: "rgba(239,68,68,0.18)", color: "#FCA5A5", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            High Priority
          </span>
          <h2 className="text-3xl font-bold text-white">Top Risk Customers</h2>
          <p className="mt-2 text-slate-400 text-sm">
            ลูกค้า 50 อันดับแรกที่มีโอกาส Churn สูงสุด เรียงตาม Churn Probability
          </p>
        </div>
      </div>

      <div className="glass p-5 sm:p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "rgba(11,25,55,0.08)" }}>
                {["#", "Account ID", "Status", "Credit", "Churn Prob.", "Risk", "Days Inactive", "Total Payments", "Amount Paid", "Expire"].map(h => (
                  <th key={h} className="pb-3 pr-4 text-[11px] font-semibold text-slate-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "rgba(11,25,55,0.05)" }}>
              {customers.map((c: any, i: number) => (
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
                  <td className="py-3 pr-4 text-slate-500 text-xs">{c.credit ?? "-"}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(c.churn_probability * 100).toFixed(0)}%`,
                            background: c.churn_probability >= 0.6 ? "#EF4444" : c.churn_probability >= 0.3 ? "#F59E0B" : "#10B981",
                          }}
                        />
                      </div>
                      <span
                        className="font-mono text-xs font-semibold"
                        style={{ color: c.churn_probability >= 0.6 ? "#DC2626" : c.churn_probability >= 0.3 ? "#D97706" : "#059669" }}
                      >
                        {(c.churn_probability * 100).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4"><RiskBadge risk={c.risk ?? "High"} /></td>
                  <td className="py-3 pr-4 text-slate-500 font-mono text-xs">{c.days_since_last_access?.toLocaleString()} d</td>
                  <td className="py-3 pr-4 text-slate-500 text-xs">{c.total_payments ?? 0}</td>
                  <td className="py-3 pr-4 text-slate-500 text-xs">
                    ฿{Number(c.total_amount_paid ?? 0).toLocaleString()}
                  </td>
                  <td className="py-3 text-slate-400 text-xs">{c.expire}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
