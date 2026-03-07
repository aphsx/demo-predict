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
  color?: string;
}

function StatCard({ label, value, sub, color = "text-white" }: StatCardProps) {
  return (
    <div className="glass metric-ring flex flex-col gap-2 p-6">
      <p className="section-label">{label}</p>
      <p className={`text-3xl font-semibold tracking-tight ${color}`}>{value}</p>
      {sub && <p className="text-sm text-slate-400">{sub}</p>}
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
          label: "Total customers",
          value: stats.total_customers.toLocaleString(),
          sub: `${compact.format(stats.total_customers)} profiles in scoring base`,
          color: "text-white",
        },
        {
          label: "Churn rate",
          value: formatPercent(stats.churn_rate),
          sub: `${stats.churned_customers.toLocaleString()} accounts predicted as churned`,
          color: "text-red-300",
        },
        {
          label: "Active base",
          value: stats.active_customers.toLocaleString(),
          sub: "Customers still engaged in the current cycle",
          color: "text-emerald-300",
        },
        {
          label: "Model AUC",
          value: Number(stats.model_auc).toFixed(3),
          sub: stats.model_name,
          color: "text-cyan-300",
        },
      ]
    : [];

  const riskCards = stats
    ? [
        {
          label: "High risk",
          range: "≥ 60% probability",
          value: stats.high_risk,
          description: "Prioritize intervention and retention outreach.",
          tone: "text-red-300 border-red-400/20",
        },
        {
          label: "Medium risk",
          range: "30–60% probability",
          value: stats.medium_risk,
          description: "Watch closely with proactive campaign triggers.",
          tone: "text-amber-200 border-amber-300/20",
        },
        {
          label: "Low risk",
          range: "< 30% probability",
          value: stats.low_risk,
          description: "Stable accounts with normal engagement trend.",
          tone: "text-emerald-200 border-emerald-300/20",
        },
      ]
    : [];

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="glass glass-strong overflow-hidden px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
          <div className="space-y-5">
            <p className="section-label">Executive dashboard</p>
            <div className="space-y-4">
              <h2 className="max-w-4xl text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                <span className="text-gradient">One move, endless potential</span>
                <br />
                for customer retention intelligence.
              </h2>
              <p className="max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                Monitor churn risk, account health, and revenue exposure in one command center designed with a modern martech interface system.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/top-risk"
                className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
              >
                Review top-risk accounts
              </Link>
              <Link
                href="/predict"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Run live prediction
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="glass metric-ring p-6">
              <p className="section-label">Realtime status</p>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-4xl font-semibold text-white">
                    {stats ? formatPercent(stats.churn_rate) : "--"}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">Current churn exposure across the tracked customer base.</p>
                </div>
                <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200">
                  Live
                </div>
              </div>
            </div>
            <div className="glass p-6">
              <p className="section-label">Revenue contrast</p>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400">Active</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {stats ? currency.format(stats.avg_spend_active) : "--"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Churned</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {stats ? currency.format(stats.avg_spend_churned) : "--"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="glass border border-red-500/30 bg-red-900/20 p-4 text-sm text-red-300">
          ⚠️ {error}
        </div>
      )}

      {/* KPI Cards */}
      {stats && (
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {kpiCards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} sub={card.sub} color={card.color} />
          ))}
        </section>
      )}

      {stats && (
        <section className="grid gap-4 lg:grid-cols-3">
          {riskCards.map((card) => (
            <div key={card.label} className={`glass border p-6 ${card.tone}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="section-label">{card.label}</p>
                  <p className="mt-3 text-4xl font-semibold text-white">{card.value.toLocaleString()}</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                  {card.range}
                </span>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-400">{card.description}</p>
            </div>
          ))}
        </section>
      )}

      {stats && (
        <section className="grid gap-6 xl:grid-cols-[1.05fr_1fr]">
          <div className="glass p-6 sm:p-7">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <p className="section-label">Risk distribution</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Portfolio risk mix</h3>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                Updated live
              </div>
            </div>
            <RiskPieChart high={stats.high_risk} medium={stats.medium_risk} low={stats.low_risk} />
          </div>

          <div className="glass p-6 sm:p-7">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <p className="section-label">Spend analysis</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Average spend by lifecycle status</h3>
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>Active: {currency.format(stats.avg_spend_active)}</p>
                <p>Churned: {currency.format(stats.avg_spend_churned)}</p>
              </div>
            </div>
            <SpendBarChart data={spendData} />
          </div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="glass p-6 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="section-label">Priority accounts</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Top 10 churn-risk customers</h3>
            </div>
            <Link
              href="/top-risk"
              className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10"
            >
              View full list
            </Link>
          </div>

          {topRisk.length === 0 ? (
            <p className="text-sm text-slate-500">ไม่มีข้อมูล</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="pb-3 pr-4 text-xs font-medium text-slate-500">#</th>
                    <th className="pb-3 pr-4 text-xs font-medium text-slate-500">Account ID</th>
                    <th className="pb-3 pr-4 text-xs font-medium text-slate-500">Status</th>
                    <th className="pb-3 pr-4 text-xs font-medium text-slate-500">Churn prob.</th>
                    <th className="pb-3 pr-4 text-xs font-medium text-slate-500">Risk</th>
                    <th className="pb-3 pr-4 text-xs font-medium text-slate-500">Days inactive</th>
                    <th className="pb-3 pr-4 text-xs font-medium text-slate-500">Payments</th>
                    <th className="pb-3 text-xs font-medium text-slate-500">Expire</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {topRisk.map((customer, index) => {
                    const probability = customer.churn_probability * 100;

                    return (
                      <tr key={customer.acc_id} className="transition-colors hover:bg-white/[0.03]">
                        <td className="py-4 pr-4 font-mono text-xs text-slate-500">{index + 1}</td>
                        <td className="py-4 pr-4">
                          <Link
                            href={`/customers/${customer.acc_id}`}
                            className="font-mono text-sm text-cyan-300 transition-colors hover:text-cyan-200"
                          >
                            {customer.acc_id}
                          </Link>
                        </td>
                        <td className="py-4 pr-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              customer.status === "paid"
                                ? "border border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
                                : "border border-white/10 bg-white/5 text-slate-300"
                            }`}
                          >
                            {customer.status}
                          </span>
                        </td>
                        <td className="py-4 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-white/5">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500"
                                style={{ width: `${probability.toFixed(0)}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs text-cyan-200">{probability.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-4 pr-4">
                          <RiskBadge risk={customer.risk ?? "High"} />
                        </td>
                        <td className="py-4 pr-4 font-mono text-xs text-slate-400">
                          {customer.days_since_last_access?.toLocaleString() ?? 0} d
                        </td>
                        <td className="py-4 pr-4 text-xs text-slate-400">{customer.total_payments ?? 0}</td>
                        <td className="py-4 text-xs text-slate-500">{customer.expire ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {stats && (
          <div className="glass p-6 sm:p-7">
            <p className="section-label">Insight summary</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Retention actions for this cycle</h3>
            <div className="mt-6 space-y-4">
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-medium text-white">Highest urgency</p>
                <p className="mt-2 text-sm leading-7 text-slate-400">
                  Focus first on <span className="text-white">{stats.high_risk.toLocaleString()}</span> high-risk accounts and deploy retention outreach before next expiry cycle.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-medium text-white">Revenue signal</p>
                <p className="mt-2 text-sm leading-7 text-slate-400">
                  Average spend differs between active and churned segments by <span className="text-white">{currency.format(Math.abs(stats.avg_spend_active - stats.avg_spend_churned))}</span>.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-medium text-white">Model confidence</p>
                <p className="mt-2 text-sm leading-7 text-slate-400">
                  Current scoring runs on <span className="text-white">{stats.model_name}</span> with AUC <span className="text-white">{Number(stats.model_auc).toFixed(3)}</span>.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
