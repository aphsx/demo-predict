import RiskPieChart from "@/components/RiskPieChart";
import ChurnTrendChart from "@/components/ChurnTrendChart";
import RetentionBarChart from "@/components/RetentionBarChart";
import { getActiveRunId, getActiveRunName } from "@/lib/activeRun";

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

async function getStats(runId?: number | null) {
  try {
    const q = runId ? `?run_id=${runId}` : "";
    const res = await fetch(`${API}/api/stats${q}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<DashboardStats>;
  } catch {
    return null;
  }
}

async function getTopRisk(n = 10, runId?: number | null) {
  try {
    const q = runId ? `&run_id=${runId}` : "";
    const res = await fetch(`${API}/api/top-risk?n=${n}${q}`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json() as Promise<TopRiskCustomer[]>;
  } catch {
    return [];
  }
}

async function getChurnTrend(runId?: number | null) {
  try {
    const q = runId ? `?run_id=${runId}` : "";
    const res = await fetch(`${API}/api/churn-trend${q}`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json() as Promise<{ month: string; rate: number }[]>;
  } catch {
    return [];
  }
}

async function getRetentionTrend(runId?: number | null) {
  try {
    const q = runId ? `?run_id=${runId}` : "";
    const res = await fetch(`${API}/api/retention-trend${q}`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json() as Promise<{ month: string; churned: number; retained: number }[]>;
  } catch {
    return [];
  }
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
  const [runId, runName] = await Promise.all([getActiveRunId(), getActiveRunName()]);

  let stats: DashboardStats | null = null;
  let topRisk: TopRiskCustomer[] = [];
  let churnTrend: { month: string; rate: number }[] = [];
  let retentionTrend: { month: string; churned: number; retained: number }[] = [];
  try {
    [stats, topRisk, churnTrend, retentionTrend] = await Promise.all([
      getStats(runId), getTopRisk(10, runId), getChurnTrend(runId), getRetentionTrend(runId),
    ]);
  } catch {
    // API not available — show empty layout
  }

  const s = stats; // shorthand for null-safe access
  const kpiCards = [
    {
      label: "Total Customers",
      value: s ? s.total_customers.toLocaleString() : "—",
      sub: s ? `${compact.format(s.total_customers)} profiles in scoring base` : "ยังไม่มีข้อมูล",
      accent: "#005AE2",
      dot: "#005AE2",
    },
    {
      label: "Churn Rate",
      value: s ? formatPercent(s.churn_rate) : "—",
      sub: s ? `${s.churned_customers.toLocaleString()} accounts predicted as churned` : "ยังไม่มีข้อมูล",
      accent: "#fc4c02",
      dot: "#fc4c02",
    },
    {
      label: "Active Base",
      value: s ? s.active_customers.toLocaleString() : "—",
      sub: s ? "Customers still engaged in current cycle" : "ยังไม่มีข้อมูล",
      accent: "#10B981",
      dot: "#10B981",
    },
    {
      label: "Revenue at Risk",
      value: s ? currency.format(s.revenue_at_risk ?? 0) : "—",
      sub: s ? `LTV รวมของลูกค้า High Risk ${s.high_risk.toLocaleString()} ราย` : "ยังไม่มีข้อมูล",
      accent: "#7c3aed",
      dot: "#7c3aed",
    },
    {
      label: "Model AUC",
      value: s?.model_auc != null ? Number(s.model_auc).toFixed(4) : "—",
      sub: s ? s.model_name : "ยังไม่มีข้อมูล",
      accent: "#005AE2",
      dot: "#005AE2",
    },
  ];

  const riskCards = [
    {
      label: "High Risk",
      range: "≥ 60% probability",
      value: s ? s.high_risk.toLocaleString() : "—",
      description: s ? "Prioritize intervention and retention outreach immediately." : "ยังไม่มีข้อมูลการวิเคราะห์ความเสี่ยง",
      cardBg: "bg-[#FF4D00]",
      textColor: "text-white",
      subTextColor: "text-white/90",
      badgeBg: "rgba(255, 255, 255, 0.2)",
      badgeBorder: "rgba(255, 255, 255, 0.3)",
      barTrack: "bg-white/30",
      barFill: "white",
      pct: s?.total_customers ? (s.high_risk / s.total_customers) * 100 : 0,
    },
    {
      label: "Medium Risk",
      range: "30–60% probability",
      value: s ? s.medium_risk.toLocaleString() : "—",
      description: s ? "Watch closely with proactive campaign triggers." : "ยังไม่มีข้อมูลการวิเคราะห์ความเสี่ยง",
      cardBg: "bg-[#FFAB00]",
      textColor: "text-white",
      subTextColor: "text-white/90",
      badgeBg: "rgba(255, 255, 255, 0.2)",
      badgeBorder: "rgba(255, 255, 255, 0.3)",
      barTrack: "bg-white/30",
      barFill: "white",
      pct: s?.total_customers ? (s.medium_risk / s.total_customers) * 100 : 0,
    },
    {
      label: "Low Risk",
      range: "< 30% probability",
      value: s ? s.low_risk.toLocaleString() : "—",
      description: s ? "Stable accounts with normal engagement trend." : "ยังไม่มีข้อมูลการวิเคราะห์ความเสี่ยง",
      cardBg: "bg-[#0870FF]",
      textColor: "text-white",
      subTextColor: "text-white/90",
      badgeBg: "rgba(255, 255, 255, 0.2)",
      badgeBorder: "rgba(255, 255, 255, 0.3)",
      barTrack: "bg-white/30",
      barFill: "white",
      pct: s?.total_customers ? (s.low_risk / s.total_customers) * 100 : 0,
    },
  ];

  return (
    <div className="space-y-6 lg:space-y-7">

      {/* ── Hero Banner (CRM Dashboard Style) ── */}
      <section className="-mx-5 -mt-6 sm:-mx-8 lg:-mx-10 lg:-mt-8 relative overflow-hidden bg-gradient-to-r from-[#005AE2] via-[#005AE2] to-[#c96216] px-8 py-8 sm:px-10 lg:px-12 lg:pt-10 lg:pb-[20px] shadow-sm">

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

      {/* ── KPI Cards (Overlapping Banner) ── */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 relative z-30 mt-[-80px] px-2 sm:px-0">
        {kpiCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </section>

      {/* ── Risk Segmentation ── */}
      <section className="grid gap-4 lg:grid-cols-3">
        {riskCards.map((card) => (
          <div
            key={card.label}
            className={`flex flex-col gap-4 p-6 rounded-[16px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] ${card.cardBg} ${card.textColor}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-col gap-1 mb-2">
                  <p className={`text-[11px] font-bold uppercase tracking-[0.15em] ${card.subTextColor}`}>{card.label}</p>
                </div>
                <p className="text-[32px] font-bold tracking-tight leading-none">
                  {card.value}
                </p>
              </div>
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide"
                style={{ background: card.badgeBg, color: "white", border: `1px solid ${card.badgeBorder}` }}
              >
                {card.range}
              </span>
            </div>

            {/* Minimal progress bar */}
            <div className={`h-1.5 w-full rounded-full overflow-hidden mt-1 ${card.barTrack}`}>
              <div
                className="h-full rounded-full"
                style={{ width: `${card.pct.toFixed(1)}%`, background: card.barFill }}
              />
            </div>
            <p className={`text-[13px] font-medium mt-1 ${card.subTextColor}`}>{card.description}</p>
          </div>
        ))}
      </section>

      {/* ── Charts (3 in a row) ── */}
      <section className="grid gap-5 xl:grid-cols-3">
        {/* Churn Rate Trends — by join-month cohort */}
        <div className="bg-white rounded-[16px] border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 relative overflow-hidden">
          <h3 className="text-base font-bold text-gray-900 mb-4">Churn Rate Trends</h3>
          {churnTrend.length > 0 ? (
            <ChurnTrendChart data={churnTrend} />
          ) : (
            <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">ยังไม่มีข้อมูล</div>
          )}
        </div>

        {/* Customer Risk Distribution */}
        <div className="bg-white rounded-[16px] border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6">
          <h3 className="text-base font-bold text-gray-900 mb-4">Customer Risk Distribution</h3>
          {s ? (
            <RiskPieChart high={s.high_risk} medium={s.medium_risk} low={s.low_risk} />
          ) : (
            <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">ยังไม่มีข้อมูล</div>
          )}
        </div>

        {/* Monthly Customer Retention — by join-month cohort */}
        <div className="bg-white rounded-[16px] border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 relative overflow-hidden">
          <h3 className="text-base font-bold text-gray-900 mb-4">Monthly Customer Retention</h3>
          {retentionTrend.length > 0 ? (
            <RetentionBarChart data={retentionTrend} />
          ) : (
            <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">ยังไม่มีข้อมูล</div>
          )}
        </div>
      </section>



    </div>
  );
}
