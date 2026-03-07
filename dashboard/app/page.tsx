import Link from "next/link";
import RiskPieChart from "@/components/RiskPieChart";
import SpendBarChart from "@/components/SpendBarChart";
import { RiskBadge } from "@/components/RiskBadge";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function getStats() {
  const res = await fetch(`${API}/api/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error("stats fetch failed");
  return res.json();
}

async function getTopRisk(n = 10) {
  const res = await fetch(`${API}/api/top-risk?n=${n}`, { cache: "no-store" });
  if (!res.ok) throw new Error("top-risk fetch failed");
  return res.json();
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

function StatCard({ label, value, sub, color = "text-white" }: StatCardProps) {
  return (
    <div className="glass p-5 flex flex-col gap-1">
      <p className="text-xs text-slate-500 uppercase tracking-widest">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  let stats: any = null;
  let topRisk: any[] = [];
  let error: string | null = null;

  try {
    [stats, topRisk] = await Promise.all([getStats(), getTopRisk(10)]);
  } catch (e: any) {
    error = "ไม่สามารถเชื่อมต่อ API ได้ — ตรวจสอบว่า FastAPI กำลังรันที่ port 8000";
  }

  const spendData = stats
    ? [
        { label: "Active", value: stats.avg_spend_active },
        { label: "Churned", value: stats.avg_spend_churned },
      ]
    : [];

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard Overview</h2>
        <p className="text-sm text-slate-500 mt-1">
          Customer churn analysis · ข้อมูลเรียลไทม์จาก Random Forest + Keras H5 model
        </p>
      </div>

      {error && (
        <div className="glass p-4 border border-red-500/30 bg-red-900/20 text-red-300 text-sm rounded-xl">
          ⚠️ {error}
        </div>
      )}

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Customers" value={stats.total_customers.toLocaleString()} />
          <StatCard
            label="Churn Rate"
            value={`${stats.churn_rate}%`}
            sub={`${stats.churned_customers} churned`}
            color="text-red-400"
          />
          <StatCard
            label="Active Customers"
            value={stats.active_customers.toLocaleString()}
            color="text-emerald-400"
          />
          <StatCard label="Model AUC" value={stats.model_auc} sub={stats.model_name} color="text-brand-500" />
        </div>
      )}

      {/* Risk tier cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="glass p-5 border border-red-500/20">
            <p className="text-xs text-slate-500 uppercase tracking-widest">High Risk ≥ 60%</p>
            <p className="text-3xl font-bold text-red-400 mt-1">{stats.high_risk.toLocaleString()}</p>
            <p className="text-xs text-slate-600 mt-1">ต้องดำเนินการด่วน</p>
          </div>
          <div className="glass p-5 border border-amber-500/20">
            <p className="text-xs text-slate-500 uppercase tracking-widest">Medium Risk 30–60%</p>
            <p className="text-3xl font-bold text-amber-400 mt-1">{stats.medium_risk.toLocaleString()}</p>
            <p className="text-xs text-slate-600 mt-1">ติดตามอย่างใกล้ชิด</p>
          </div>
          <div className="glass p-5 border border-emerald-500/20">
            <p className="text-xs text-slate-500 uppercase tracking-widest">Low Risk &lt; 30%</p>
            <p className="text-3xl font-bold text-emerald-400 mt-1">{stats.low_risk.toLocaleString()}</p>
            <p className="text-xs text-slate-600 mt-1">ลูกค้าปกติ</p>
          </div>
        </div>
      )}

      {/* Charts row */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Risk Distribution</h3>
            <RiskPieChart
              high={stats.high_risk}
              medium={stats.medium_risk}
              low={stats.low_risk}
            />
          </div>
          <div className="glass p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">
              Avg Spend: Active vs Churned (฿)
            </h3>
            <SpendBarChart data={spendData} />
            <p className="text-xs text-slate-600 mt-2 text-center">
              Active avg: ฿{stats.avg_spend_active?.toLocaleString()} ·
              Churned avg: ฿{stats.avg_spend_churned?.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Top 10 Risk Table */}
      <div className="glass p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-300">🔴 Top 10 ลูกค้าเสี่ยง Churn สูงสุด</h3>
          <Link
            href="/top-risk"
            className="text-xs text-brand-500 hover:text-brand-400 transition-colors"
          >
            ดูทั้งหมด →
          </Link>
        </div>
        {topRisk.length === 0 ? (
          <p className="text-slate-500 text-sm">ไม่มีข้อมูล</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-left">
                  <th className="pb-3 pr-4 text-xs text-slate-500 font-medium">#</th>
                  <th className="pb-3 pr-4 text-xs text-slate-500 font-medium">Account ID</th>
                  <th className="pb-3 pr-4 text-xs text-slate-500 font-medium">Status</th>
                  <th className="pb-3 pr-4 text-xs text-slate-500 font-medium">Churn Prob.</th>
                  <th className="pb-3 pr-4 text-xs text-slate-500 font-medium">Risk</th>
                  <th className="pb-3 pr-4 text-xs text-slate-500 font-medium">Days Inactive</th>
                  <th className="pb-3 pr-4 text-xs text-slate-500 font-medium">Payments</th>
                  <th className="pb-3 text-xs text-slate-500 font-medium">Expire</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {topRisk.map((c: any, i: number) => (
                  <tr key={c.acc_id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 pr-4 text-slate-600 font-mono text-xs">{i + 1}</td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/customers/${c.acc_id}`}
                        className="font-mono text-brand-500 hover:text-brand-400 hover:underline"
                      >
                        {c.acc_id}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          c.status === "paid"
                            ? "bg-blue-500/20 text-blue-300"
                            : "bg-slate-700 text-slate-400"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-500 rounded-full"
                            style={{ width: `${(c.churn_probability * 100).toFixed(0)}%` }}
                          />
                        </div>
                        <span className="text-red-300 font-mono text-xs">
                          {(c.churn_probability * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <RiskBadge risk={c.risk ?? "High"} />
                    </td>
                    <td className="py-3 pr-4 text-slate-400 font-mono text-xs">
                      {c.days_since_last_access?.toLocaleString()} d
                    </td>
                    <td className="py-3 pr-4 text-slate-400 text-xs">
                      {c.total_payments ?? 0}
                    </td>
                    <td className="py-3 text-slate-500 text-xs">{c.expire}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
