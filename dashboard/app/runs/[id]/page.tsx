import Link from "next/link";
import { notFound } from "next/navigation";
import RunChat from "./RunChat";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type Run = {
  id: number;
  name: string;
  status: "pending" | "done" | "error";
  created_at: string;
  customers_count?: number;
};

type Stats = {
  total_customers: number;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  revenue_at_risk: number;
};

type Customer = {
  acc_id: string;
  churn_probability: number;
  risk_tier: string;
  ltv?: number;
  total_amount_paid?: number;
  rfm_segment?: string;
  risk_factor?: string;
  recommended_action?: string;
};

async function getRun(id: string): Promise<Run | null> {
  try {
    const res = await fetch(`${API}/api/runs/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function getStats(): Promise<Stats | null> {
  try {
    const res = await fetch(`${API}/api/stats`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function getTopRisk(n = 20): Promise<Customer[]> {
  try {
    const res = await fetch(`${API}/api/top-risk?n=${n}`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

const currency = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });

function ChurnBar({ prob }: { prob: number }) {
  const pct = Math.round(prob * 100);
  const color = prob >= 0.6 ? "#FF4D00" : prob >= 0.3 ? "#FFAB00" : "#0870FF";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono text-xs font-bold" style={{ color }}>{pct}%</span>
    </div>
  );
}

function RiskChip({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    High: "badge-high",
    Medium: "badge-medium",
    Low: "badge-low",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${map[tier] ?? "badge-low"}`}>
      {tier}
    </span>
  );
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [run, stats, topRisk] = await Promise.all([
    getRun(id),
    getStats(),
    getTopRisk(20),
  ]);

  if (!run) notFound();

  const metricCards = [
    {
      label: "ลูกค้าทั้งหมด",
      value: (run.customers_count ?? stats?.total_customers ?? 0).toLocaleString(),
      sub: "คนใน Run นี้",
      color: "#005AE2",
    },
    {
      label: "High Risk",
      value: stats ? stats.high_risk.toLocaleString() : "—",
      sub: stats ? `${((stats.high_risk / stats.total_customers) * 100).toFixed(1)}% ของทั้งหมด` : "",
      color: "#FF4D00",
    },
    {
      label: "Medium Risk",
      value: stats ? stats.medium_risk.toLocaleString() : "—",
      sub: stats ? `${((stats.medium_risk / stats.total_customers) * 100).toFixed(1)}% ของทั้งหมด` : "",
      color: "#FFAB00",
    },
    {
      label: "Revenue at Risk",
      value: stats ? currency.format(stats.revenue_at_risk) : "—",
      sub: "LTV รวมของ High Risk",
      color: "#7c3aed",
    },
  ];

  return (
    <div className="space-y-6 lg:space-y-7">
      {/* Header */}
      <section className="-mx-5 -mt-6 sm:-mx-8 lg:-mx-10 lg:-mt-8 relative overflow-hidden bg-gradient-to-r from-[#005AE2] via-[#005AE2] to-[#c96216] px-8 py-7 sm:px-10 lg:px-12 shadow-sm">
        <div className="absolute right-[-20px] top-0 select-none pointer-events-none opacity-[0.85] mix-blend-overlay">
          <span className="text-[140px] leading-[0.85] font-black tracking-tighter text-white" style={{ fontFamily: "Arial, sans-serif" }}>
            1MO<br />BY
          </span>
        </div>
        <div className="relative z-20 flex items-start gap-4 pt-2">
          <Link
            href="/runs"
            className="mt-1 flex-shrink-0 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] text-white/70 uppercase mb-1">
              Run #{run.id}
            </p>
            <h2 className="text-[22px] sm:text-[28px] font-bold text-white leading-tight">
              {run.name}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              {run.status === "done" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-400/20 border border-green-300/30 px-2.5 py-1 text-[11px] font-bold text-green-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white/70">
                  {run.status}
                </span>
              )}
              <span className="text-white/50 text-xs">
                {new Date(run.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Metric cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 relative z-30 mt-[-80px] px-2 sm:px-0">
        {metricCards.map((card) => (
          <div
            key={card.label}
            className="flex flex-col gap-2 p-5 bg-white rounded-[16px] border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#5A6B8A]">{card.label}</p>
            <p className="text-[28px] font-bold leading-none" style={{ color: card.color }}>{card.value}</p>
            {card.sub && <p className="text-xs text-gray-400">{card.sub}</p>}
          </div>
        ))}
      </section>

      {/* Top 20 Risk Table */}
      {run.status === "done" && topRisk.length > 0 && (
        <section className="bg-white rounded-[16px] border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Top 20 ที่เสี่ยงที่สุด</h3>
            <a
              href={`${API}/api/export?sort_by=churn_probability&order=desc`}
              download="top_risk.csv"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#005AE2] hover:underline"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export CSV
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["#", "Account ID", "Churn %", "Risk", "LTV", "RFM Segment", "เหตุผล", "แนะนำ"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-gray-400 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topRisk.map((c, i) => (
                  <tr key={c.acc_id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">{i + 1}</td>
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.acc_id}`} className="font-mono text-[#005AE2] hover:underline text-xs font-bold">
                        {c.acc_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3"><ChurnBar prob={c.churn_probability} /></td>
                    <td className="px-4 py-3"><RiskChip tier={c.risk_tier} /></td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-700">
                      {currency.format(c.ltv ?? c.total_amount_paid ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                        {c.rfm_segment ?? "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px] truncate">{c.risk_factor ?? "-"}</td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-600 whitespace-nowrap">{c.recommended_action ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Chat */}
      {run.status === "done" && (
        <section className="bg-white rounded-[16px] border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-[#005AE2] flex items-center justify-center text-white text-[10px] font-bold">
              AI
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Chat กับ AI เกี่ยวกับ Run นี้</h3>
              <p className="text-[11px] text-gray-400">ถามอะไรก็ได้เกี่ยวกับข้อมูล {run.name}</p>
            </div>
          </div>
          <RunChat runName={run.name} />
        </section>
      )}

      {/* No data state */}
      {run.status !== "done" && (
        <div className="flex flex-col items-center gap-3 py-12 bg-white rounded-[16px] border border-gray-200 text-center">
          <p className="text-gray-500 font-medium">Run นี้ยังไม่มีผล predict</p>
          <p className="text-sm text-gray-400">กรุณาอัพโหลดไฟล์ Users CSV และ Payments CSV ก่อน</p>
          <Link href="/runs" className="mt-2 text-sm font-bold text-[#005AE2] hover:underline">
            ← กลับไปหน้า Runs
          </Link>
        </div>
      )}
    </div>
  );
}
