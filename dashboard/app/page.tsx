import Link from "next/link";
import RiskPieChart from "@/components/RiskPieChart";
import ChurnTrendChart from "@/components/ChurnTrendChart";
import RetentionBarChart from "@/components/RetentionBarChart";
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
  revenue_at_risk: number;
}

interface TopRiskCustomer {
  acc_id: string;
  status: string;
  churn_probability: number;
  risk?: string;
  days_since_last_access?: number;
  total_payments?: number;
  expire?: string;
  ltv?: number;
  rfm_segment?: string;
  risk_factor?: string;
  recommended_action?: string;
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
        label: "Revenue at Risk",
        value: currency.format(stats.revenue_at_risk ?? 0),
        sub: `LTV รวมของลูกค้า High Risk ${stats.high_risk.toLocaleString()} ราย`,
        accent: "#7c3aed",
        dot: "#7c3aed",
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
        barColor: "#F56200",
        bgColor: "#FFF3EB",
        borderColor: "#FFCFA0",
        textColor: "#C74E00",
        pct: stats.total_customers ? (stats.high_risk / stats.total_customers) * 100 : 0,
      },
      {
        label: "Medium Risk",
        range: "30–60% probability",
        value: stats.medium_risk,
        description: "Watch closely with proactive campaign triggers.",
        barColor: "#FFB020",
        bgColor: "#FFFBF0",
        borderColor: "#FFE4A0",
        textColor: "#A07000",
        pct: stats.total_customers ? (stats.medium_risk / stats.total_customers) * 100 : 0,
      },
      {
        label: "Low Risk",
        range: "< 30% probability",
        value: stats.low_risk,
        description: "Stable accounts with normal engagement trend.",
        barColor: "#1A6BFF",
        bgColor: "#EEF3FF",
        borderColor: "#BFCFFF",
        textColor: "#1243C2",
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
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 relative z-30 mt-[-80px] px-2 sm:px-0">
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

      {/* ── Charts (3 in a row) ── */}
      {stats && (
        <section className="grid gap-5 xl:grid-cols-3">
          {/* Churn Rate Trends — [DEMO] ยังไม่มี historical data API */}
          <div className="bg-white rounded-[16px] border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 relative overflow-hidden">
            <h3 className="text-base font-bold text-gray-900 mb-4">Churn Rate Trends</h3>
            <ChurnTrendChart />
          </div>

          {/* Customer Risk Distribution */}
          <div className="bg-white rounded-[16px] border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6">
            <h3 className="text-base font-bold text-gray-900 mb-4">Customer Risk Distribution</h3>
            <RiskPieChart high={stats.high_risk} medium={stats.medium_risk} low={stats.low_risk} />
          </div>

          {/* Monthly Customer Retention — [DEMO] ยังไม่มี historical data API */}
          <div className="bg-white rounded-[16px] border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 relative overflow-hidden">
            <h3 className="text-base font-bold text-gray-900 mb-4">Monthly Customer Retention</h3>
            <RetentionBarChart />
          </div>
        </section>
      )}



    </div>
  );
}
