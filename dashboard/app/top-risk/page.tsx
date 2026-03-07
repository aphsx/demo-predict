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
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">🔴 Top Risk Customers</h2>
        <p className="text-sm text-slate-500 mt-1">
          ลูกค้า 50 อันดับแรกที่มีโอกาส Churn สูงสุด เรียงตาม Churn Probability
        </p>
      </div>

      <div className="glass p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-left">
                {["#","Account ID","Status","Credit","Churn Prob.","Risk","Days Inactive","Total Payments","Amount Paid","Expire"].map(h => (
                  <th key={h} className="pb-3 pr-4 text-xs text-slate-500 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {customers.map((c: any, i: number) => (
                <tr key={c.acc_id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 pr-4 text-slate-600 font-mono text-xs">{i + 1}</td>
                  <td className="py-3 pr-4">
                    <Link
                      href={`/customers/${c.acc_id}`}
                      className="font-mono text-brand-500 hover:text-brand-400 hover:underline text-sm"
                    >
                      {c.acc_id}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      c.status === "paid" ? "bg-blue-500/20 text-blue-300" : "bg-slate-700 text-slate-400"
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-400 text-xs">{c.credit ?? "-"}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(c.churn_probability * 100).toFixed(0)}%`,
                            background: c.churn_probability >= 0.6 ? "#ef4444" : c.churn_probability >= 0.3 ? "#f59e0b" : "#10b981",
                          }}
                        />
                      </div>
                      <span className="text-red-300 font-mono text-xs">
                        {(c.churn_probability * 100).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4"><RiskBadge risk={c.risk ?? "High"} /></td>
                  <td className="py-3 pr-4 text-slate-400 font-mono text-xs">{c.days_since_last_access?.toLocaleString()} d</td>
                  <td className="py-3 pr-4 text-slate-400 text-xs">{c.total_payments ?? 0}</td>
                  <td className="py-3 pr-4 text-slate-400 text-xs">
                    ฿{Number(c.total_amount_paid ?? 0).toLocaleString()}
                  </td>
                  <td className="py-3 text-slate-500 text-xs">{c.expire}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
