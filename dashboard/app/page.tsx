import Link from "next/link";
import RiskPieChart from "@/components/RiskPieChart";
import SpendBarChart from "@/components/SpendBarChart";
import { RiskBadge } from "@/components/RiskBadge";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

interface DashboardStats {
  total_customers: number;
  churn_rate: number;
  churned_customers: number;
  active_customers: number;
  model_auc: number;
  model_name: string;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  avg_spend_active: number;
  avg_spend_churned: number;
}

interface TopRiskCustomer {
  acc_id: string;
  status: string;
  churn_probability: number;
  risk?: string;
  days_since_last_access?: number;
  total_payments?: number;
  expire?: string;
}

async function getStats() {
  const res = await fetch(`${API}/api/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error("stats fetch failed");
  return res.json() as Promise<DashboardStats>;
}

async function getTopRisk(n = 10) {
  const res = await fetch(`${API}/api/top-risk?n=${n}`, { cache: "no-store" });
  if (!res.ok) throw new Error("top-risk fetch failed");
  return res.json() as Promise<TopRiskCustomer[]>;
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  dot?: string;
}

function StatCard({ label, value, sub, accent = "#005AE2", dot }: StatCardProps) {
  return (
    <div className="flex flex-col gap-2 p-6 bg-white rounded-[16px] border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)] h-full justify-between transition-shadow hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
      <div className="flex items-center gap-2 mb-1">
        {dot && (
          <span
            className="h-2 w-2 rounded-full flex-shrink-0"
            style={{ background: dot }}
          />
        )}
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#5A6B8A]">{label}</p>
      </div>
      <div>
        <p className="text-[32px] font-bold tracking-tight text-gray-900 leading-none">
          {value}
        </p>
        {sub && <p className="mt-3 text-xs font-medium text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

const currency = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export default async function DashboardPage() {
  let stats: DashboardStats | null = null;
  let topRisk: TopRiskCustomer[] = [];
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

  const kpiCards = stats
    ? [
      {
        label: "Total Customers",
        value: stats.total_customers.toLocaleString(),
        sub: `${compact.format(stats.total_customers)} profiles in scoring base`,
        accent: "#005AE2",
        dot: "#005AE2", // 1Moby Blue
      },
      {
        label: "Churn Rate",
        value: formatPercent(stats.churn_rate),
        sub: `${stats.churned_customers.toLocaleString()} accounts predicted as churned`,
        accent: "#fc4c02",
        dot: "#fc4c02", // 1Moby Orange/Red
      },
      {
        label: "Active Base",
        value: stats.active_customers.toLocaleString(),
        sub: "Customers still engaged in current cycle",
        accent: "#10B981",
        dot: "#10B981", // Green
      },
      {
        label: "Model AUC",
        value: Number(stats.model_auc).toFixed(3),
        sub: stats.model_name,
        accent: "#005AE2",
        dot: "#005AE2",
      },
    ]
    : [];

  const riskCards = stats
    ? [
      {
        label: "High Risk",
        range: "≥ 60% probability",
        value: stats.high_risk,
        description: "Prioritize intervention and retention outreach immediately.",
        barColor: "#fc4c02",
        bgColor: "#fff0ea",
        borderColor: "#ffc9b3",
        textColor: "#cc3d02",
        pct: stats.total_customers ? (stats.high_risk / stats.total_customers) * 100 : 0,
      },
      {
        label: "Medium Risk",
        range: "30–60% probability",
        value: stats.medium_risk,
        description: "Watch closely with proactive campaign triggers.",
        barColor: "#ffa400",
        bgColor: "#fffaf0",
        borderColor: "#ffe3b3",
        textColor: "#b37300",
        pct: stats.total_customers ? (stats.medium_risk / stats.total_customers) * 100 : 0,
      },
      {
        label: "Low Risk",
        range: "< 30% probability",
        value: stats.low_risk,
        description: "Stable accounts with normal engagement trend.",
        barColor: "#10B981",
        bgColor: "#F0FDF4",
        borderColor: "#6EE7B7",
        textColor: "#047857",
        pct: stats.total_customers ? (stats.low_risk / stats.total_customers) * 100 : 0,
      },
    ]
    : [];

  return (
    <div className="space-y-6 lg:space-y-7">

      {/* ── Hero Banner (CRM Dashboard Style) ── */}
      <section className="-mx-5 -mt-6 sm:-mx-8 lg:-mx-10 lg:-mt-8 relative overflow-hidden bg-gradient-to-r from-[#005AE2] via-[#005AE2] to-[#c96216] px-8 py-8 sm:px-10 lg:px-12 lg:pt-10 lg:pb-[90px] shadow-sm">

        {/* Large Background Text Overlay '1MOBY' or 'M' */}
        <div className="absolute right-[-20px] top-0 select-none pointer-events-none opacity-[0.85] mix-blend-overlay">
          <span className="text-[140px] leading-[0.85] font-black tracking-tighter text-white" style={{ fontFamily: "Arial, sans-serif" }}>
            1MO<br />BY
          </span>
        </div>

        {/* Banner Content (CRM Focus) */}
        <div className="relative z-20 max-w-2xl flex flex-col items-start pt-2">
          <p className="mb-3 text-[10px] font-bold tracking-[0.2em] text-white/90 uppercase">
            Customer Retention Command Center
          </p>
          <h2 className="text-balance text-[28px] font-bold leading-[1.3] text-white sm:text-[34px] lg:text-[40px] tracking-tight">
            Churn Insight &amp; Analytics
          </h2>
          <p className="mt-4 max-w-lg text-[13px] leading-relaxed text-blue-50/90 font-medium">
            ระบบวิเคราะห์พฤติกรรมลูกค้าและประเมินความเสี่ยงในการยกเลิกบริการ (Churn Risk) แบบ Real-time เพื่อช่วยให้ทีมดูแลลูกค้าสามารถเข้าไปรักษาฐานลูกค้าได้ทันท่วงที
          </p>
        </div>
      </section>

      {/* ── Error ── */}
      {error && (
        <div className="glass border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* ── KPI Cards (Overlapping Banner) ── */}
      {stats && (
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4 relative z-30 mt-[-80px] px-2 sm:px-0">
          {kpiCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </section>
      )}

      {/* ── Risk Segmentation ── */}
      {stats && (
        <section className="grid gap-4 lg:grid-cols-3">
          {riskCards.map((card) => (
            <div
              key={card.label}
              className="flex flex-col gap-4 p-6 bg-white rounded-[16px] border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-col gap-1 mb-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#5A6B8A]">{card.label}</p>
                  </div>
                  <p className="text-[32px] font-bold tracking-tight leading-none" style={{ color: card.textColor }}>
                    {card.value.toLocaleString()}
                  </p>
                </div>
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide"
                  style={{ background: card.bgColor, color: card.textColor, border: `1px solid ${card.borderColor}` }}
                >
                  {card.range}
                </span>
              </div>

              {/* Minimal progress bar */}
              <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden mt-1">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${card.pct.toFixed(1)}%`, background: card.barColor }}
                />
              </div>
              <p className="text-[13px] font-medium text-gray-500 mt-1">{card.description}</p>
            </div>
          ))}
        </section>
      )}

      {/* ── Charts ── */}
      {stats && (
        <section className="grid gap-6 xl:grid-cols-[1.05fr_1fr]">
          <div className="glass p-6 sm:p-7">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <p className="section-label">Risk Distribution</p>
                <h3 className="mt-1.5 text-lg font-semibold text-gray-900">Portfolio risk mix</h3>
              </div>
              <span className="rounded-[10px] border border-[#006bff]/20 bg-[#006bff]/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#006bff]">
                Updated live
              </span>
            </div>
            <RiskPieChart high={stats.high_risk} medium={stats.medium_risk} low={stats.low_risk} />
          </div>

          <div className="glass p-6 sm:p-7">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <p className="section-label">Spend Analysis</p>
                <h3 className="mt-1.5 text-lg font-semibold text-gray-900">Average spend by lifecycle</h3>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p>Active: {currency.format(stats.avg_spend_active)}</p>
                <p>Churned: {currency.format(stats.avg_spend_churned)}</p>
              </div>
            </div>
            <SpendBarChart data={spendData} />
          </div>
        </section>
      )}

      {/* ── Top Risk Table + Insight Summary ── */}
      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="glass p-6 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="section-label">Priority Accounts</p>
              <h3 className="mt-1.5 text-lg font-semibold text-gray-900">Top 10 churn-risk customers</h3>
            </div>
            <Link
              href="/top-risk"
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#006bff]/20 bg-[#006bff]/5 px-4 py-2 text-xs font-semibold text-[#006bff] transition-colors hover:bg-[#006bff]/10"
            >
              View all
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {topRisk.length === 0 ? (
            <p className="text-sm text-gray-400">ไม่มีข้อมูล</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                    {["#", "Account ID", "Status", "Churn Prob.", "Risk", "Days Inactive", "Payments", "Expire"].map((h) => (
                      <th key={h} className="pb-3 pr-4 text-[11px] font-semibold text-gray-400 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
                  {topRisk.map((customer, index) => {
                    const probability = customer.churn_probability * 100;
                    return (
                      <tr key={customer.acc_id} className="transition-colors hover:bg-gray-50">
                        <td className="py-3 pr-4 font-mono text-xs text-gray-400">{index + 1}</td>
                        <td className="py-3 pr-4">
                          <Link
                            href={`/customers/${customer.acc_id}`}
                            className="font-mono text-sm font-semibold text-[#006bff] transition-colors hover:text-[#0056cc] hover:underline"
                          >
                            {customer.acc_id}
                          </Link>
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`rounded-[10px] px-2.5 py-0.5 text-[11px] font-semibold ${customer.status === "paid"
                              ? "bg-[#006bff]/5 text-[#006bff] border border-[#006bff]/20"
                              : "bg-gray-100 text-gray-500 border border-gray-200"
                              }`}
                          >
                            {customer.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${probability.toFixed(0)}%`,
                                  background:
                                    probability >= 60
                                      ? "#fc4c02"
                                      : probability >= 30
                                        ? "#ffa400"
                                        : "#10B981",
                                }}
                              />
                            </div>
                            <span
                              className="font-mono text-xs font-semibold"
                              style={{
                                color:
                                  probability >= 60 ? "#cc3d02" : probability >= 30 ? "#b37300" : "#059669",
                              }}
                            >
                              {probability.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <RiskBadge risk={customer.risk ?? "High"} />
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-gray-500">
                          {customer.days_since_last_access?.toLocaleString() ?? 0} d
                        </td>
                        <td className="py-3 pr-4 text-xs text-gray-500">{customer.total_payments ?? 0}</td>
                        <td className="py-3 text-xs text-gray-400">{customer.expire ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Insight Summary */}
        {stats && (
          <div className="glass p-6 sm:p-7 flex flex-col">
            <p className="section-label">Insight Summary</p>
            <h3 className="mt-1.5 text-lg font-semibold text-gray-900">Retention actions</h3>
            <div className="mt-5 space-y-4 flex-1">
              {[
                {
                  title: "Highest urgency",
                  body: `Focus first on ${stats.high_risk.toLocaleString()} high-risk accounts and deploy outreach before next expiry cycle.`,
                  icon: "🔴",
                  bg: "#fff0ea",
                  border: "#ffc9b3",
                },
                {
                  title: "Revenue signal",
                  body: `Active vs churned spend differs by ${currency.format(Math.abs(stats.avg_spend_active - stats.avg_spend_churned))} — significant uplift potential.`,
                  icon: "📈",
                  bg: "#e6f0ff",
                  border: "#cce1ff",
                },
                {
                  title: "Model confidence",
                  body: `Scoring runs on ${stats.model_name} with AUC ${Number(stats.model_auc).toFixed(3)} — reliable for tier segmentation.`,
                  icon: "🧠",
                  bg: "#F0FDF4",
                  border: "#A7F3D0",
                },
              ].map((ins) => (
                <div
                  key={ins.title}
                  className="rounded-[10px] p-4"
                  style={{ background: ins.bg, border: `1px solid ${ins.border}` }}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span>{ins.icon}</span> {ins.title}
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-gray-600">{ins.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
