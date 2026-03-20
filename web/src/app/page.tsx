"use client";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
         PieChart, Pie, Cell, Legend } from "recharts";
import Sidebar from "@/components/Sidebar";
import Badge from "@/components/Badge";
import { api, Run, Summary } from "@/lib/api";
import { RefreshCw, TrendingDown, Users, AlertTriangle, DollarSign, Bell, BarChart3 } from "lucide-react";

const PIE_COLORS = ["#0057a8","#ef4444","#f59e0b","#9ca3af"];
const BAR_COLORS: Record<string,string> = {
  Champions:"#7c3aed", Loyal:"#2563eb", Promising:"#0891b2",
  "Cannot Lose":"#dc2626", "At Risk":"#f97316", "Need Attention":"#6b7280"
};

function KPICard({ label, value, sub, color="blue", icon: Icon }:
  { label:string; value:string; sub?:string; color?:string; icon:any }) {
  const colors: Record<string,string> = {
    blue:"border-blue-500 bg-blue-50", red:"border-red-500 bg-red-50",
    green:"border-green-500 bg-green-50", orange:"border-orange-500 bg-orange-50",
    purple:"border-purple-500 bg-purple-50",
  };
  return (
    <div className={`rounded-xl border-l-4 p-4 shadow-sm ${colors[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        </div>
        <Icon size={20} className="text-gray-400 mt-1" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [runs, setRuns]       = useState<Run[]>([]);
  const [activeRun, setActive] = useState<Run | null>(null);
  const [summary, setSummary]  = useState<Summary | null>(null);
  const [loading, setLoading]  = useState(false);

  useEffect(() => { api.listRuns().then(r => { setRuns(r); if (r.length > 0) setActive(r[0]); }); }, []);
  useEffect(() => {
    if (!activeRun || activeRun.status !== "done") return;
    setLoading(true);
    api.getSummary(activeRun.id).then(s => { setSummary(s); setLoading(false); });
  }, [activeRun]);

  const fmt = (n?: number) => n == null ? "—" : n.toLocaleString("th-TH");
  const fmtB = (n?: number) => n == null ? "—" : `฿${n.toLocaleString("th-TH")}`;

  const churnData = summary ? Object.entries(summary.churn_tiers).map(([k,v])=>({name:k,value:v})) : [];
  const rfmData   = summary?.rfm_segments ?? [];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">ภาพรวมระบบ</h1>
            <p className="text-sm text-gray-500">Customer Predictive Analytics</p>
          </div>
          <div className="flex items-center gap-3">
            <select className="text-sm border rounded-lg px-3 py-2 bg-white"
                    value={activeRun?.id ?? ""}
                    onChange={e => setActive(runs.find(r => r.id === e.target.value) ?? null)}>
              <option value="">-- เลือก Run --</option>
              {runs.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.status})
                </option>
              ))}
            </select>
            <button onClick={() => activeRun && api.getSummary(activeRun.id).then(setSummary)}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status banner */}
          {activeRun && activeRun.status !== "done" && (
            <div className={`rounded-xl p-4 flex items-center gap-3 ${
              activeRun.status === "processing" ? "bg-blue-50 text-blue-800" :
              activeRun.status === "failed"     ? "bg-red-50 text-red-800" :
              "bg-yellow-50 text-yellow-800"
            }`}>
              <RefreshCw size={16} className={activeRun.status === "processing" ? "animate-spin" : ""} />
              <span className="text-sm font-medium">
                {activeRun.status === "processing" && "กำลัง predict... กรุณารอสักครู่"}
                {activeRun.status === "failed" && `เกิดข้อผิดพลาด: ${activeRun.error_message}`}
                {activeRun.status === "pending" && "รอ upload ข้อมูล"}
              </span>
              <Badge label={activeRun.status} />
            </div>
          )}

          {/* KPI Cards */}
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <KPICard label="ลูกค้า Active"     value={fmt(summary.active)}        icon={Users}         color="blue" />
              <KPICard label="เสี่ยง Churn สูง"  value={fmt(summary.high_churn)}    icon={TrendingDown}  color="red"  />
              <KPICard label="Revenue at Risk"  value={fmtB(summary.revenue_at_risk)} icon={DollarSign}  color="orange"
                       sub="churn_prob × CLV" />
              <KPICard label="Avg CLV 6 เดือน"  value={fmtB(summary.avg_clv)}       icon={DollarSign}   color="green" />
              <KPICard label="Critical Top-up"  value={fmt(summary.critical_topup)} icon={Bell}          color="red" />
              <KPICard label="ลูกค้าทั้งหมด"    value={fmt(summary.total)}          icon={Users}         color="purple" />
            </div>
          )}

          {/* Charts */}
          {summary && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Churn Tier Donut */}
              <div className="bg-white rounded-xl border p-5 shadow-sm">
                <h2 className="font-semibold text-gray-800 mb-4">การแจกแจง Churn Tier</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={churnData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                         dataKey="value" nameKey="name" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}
                         labelLine={false}>
                      {churnData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v:any) => v.toLocaleString()} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* RFM Bar */}
              <div className="bg-white rounded-xl border p-5 shadow-sm">
                <h2 className="font-semibold text-gray-800 mb-4">RFM Segments</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={rfmData} layout="vertical" margin={{left:10}}>
                    <XAxis type="number" tick={{fontSize:11}} />
                    <YAxis type="category" dataKey="rfm_segment" width={110} tick={{fontSize:11}} />
                    <Tooltip formatter={(v:any) => v.toLocaleString()} />
                    <Bar dataKey="count" radius={[0,4,4,0]}>
                      {rfmData.map((entry,i) => (
                        <Cell key={i} fill={BAR_COLORS[entry.rfm_segment] ?? "#6b7280"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Urgency Summary */}
          {summary?.urgency_dist && (
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-4">Credit Top-up Urgency</h2>
              <div className="flex gap-4 flex-wrap">
                {Object.entries(summary.urgency_dist).map(([u, c]) => (
                  <div key={u} className="flex items-center gap-2 bg-gray-50 rounded-lg px-4 py-3">
                    <Badge label={u} />
                    <span className="text-2xl font-bold text-gray-900">{c.toLocaleString()}</span>
                    <span className="text-sm text-gray-500">คน</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!activeRun && (
            <div className="text-center py-20 text-gray-400">
              <BarChart3 size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg">เลือก Run หรือ<a href="/runs" className="text-blue-600 underline ml-1">สร้าง Run ใหม่</a></p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
