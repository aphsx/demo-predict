import RiskPieChart from "@/components/RiskPieChart";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function getModelInfo() {
  const res = await fetch(`${API}/api/model-info`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

async function getStats() {
  const res = await fetch(`${API}/api/stats`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

interface KpiCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  trend?: { value: string; up: boolean };
}

function KpiCard({ label, value, sub, icon, trend }: KpiCardProps) {
  return (
    <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.07)] transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-3">{label}</p>
          <p className="text-3xl font-black text-gray-900 leading-none tracking-tight">{value}</p>
          <p className="mt-2 text-xs text-gray-500">{sub}</p>
        </div>
        <div className="w-10 h-10 rounded-[10px] bg-gray-50 flex items-center justify-center text-gray-400 flex-shrink-0">
          {icon}
        </div>
      </div>
      {trend && (
        <div className={`mt-3 flex items-center gap-1 text-xs font-semibold ${trend.up ? "text-emerald-600" : "text-red-500"}`}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {trend.up
              ? <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>
              : <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></>
            }
          </svg>
          {trend.value}
        </div>
      )}
    </div>
  );
}

export default async function ModelPage() {
  const [info, stats] = await Promise.all([getModelInfo(), getStats()]);

  const features: [string, number][] = info?.feature_importance
    ? Object.entries<number>(info.feature_importance).slice(0, 10)
    : [];
  const maxFI = features.length > 0 ? (features[0][1] as number) : 1;

  const auc = info?.test_auc ? Number(info.test_auc) : 0;
  const aucPct = (auc * 100).toFixed(1);

  const kpis: KpiCardProps[] = [
    {
      label: "Total Customers",
      value: stats?.total_customers?.toLocaleString() ?? "—",
      sub: "Profiles in scoring base",
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
    },
    {
      label: "Average Churn Risk",
      value: stats?.churn_rate ? `${stats.churn_rate.toFixed(1)}%` : "—",
      sub: `${stats?.churned_customers?.toLocaleString() ?? "—"} predicted churn`,
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
    },
    {
      label: "Revenue at Risk",
      value: stats?.revenue_at_risk
        ? `฿${(stats.revenue_at_risk / 1000).toFixed(0)}K`
        : "—",
      sub: `LTV of ${stats?.high_risk?.toLocaleString() ?? "—"} high-risk accounts`,
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
    },
    {
      label: "Model AUC Score",
      value: auc > 0 ? aucPct + "%" : "—",
      sub: info?.model_type ?? "sklearn Pipeline",
      icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-[20px] border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] px-7 py-6">
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase mb-1">AI Engine</p>
        <h2 className="text-2xl font-bold text-gray-900">Analytics &amp; Model Performance</h2>
        <p className="mt-1 text-sm text-gray-400">ภาพรวมประสิทธิภาพ ML model และการกระจายความเสี่ยงของลูกค้า</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
      </div>

      {/* Charts row */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Feature Importance */}
        <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-1">Feature Analysis</p>
              <h3 className="text-base font-bold text-gray-900">Top Feature Importance</h3>
            </div>
            <span className="rounded-[8px] bg-blue-50 border border-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-600">
              Random Forest
            </span>
          </div>
          {features.length > 0 ? (
            <div className="space-y-3">
              {features.map(([feat, imp], i) => {
                const pct = ((imp as number) / maxFI) * 100;
                const barColor = i === 0 ? "#005AE2" : i === 1 ? "#38BDF8" : i < 4 ? "#6366F1" : "#94A3B8";
                return (
                  <div key={feat} className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-400 font-mono w-5 text-right flex-shrink-0">{i + 1}</span>
                    <span className="text-xs text-gray-600 font-medium w-48 truncate flex-shrink-0">{feat}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                    <span className="text-xs text-gray-500 font-mono w-12 text-right flex-shrink-0">
                      {((imp as number) * 100).toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">ไม่มีข้อมูล Feature Importance</p>
          )}
        </div>

        {/* Customer Risk Distribution */}
        <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-1">Risk Overview</p>
              <h3 className="text-base font-bold text-gray-900">Customer Risk Distribution</h3>
            </div>
            <span className="rounded-[8px] bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
              Live
            </span>
          </div>
          {stats ? (
            <>
              <RiskPieChart high={stats.high_risk} medium={stats.medium_risk} low={stats.low_risk} />
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { label: "High Risk", value: stats.high_risk, color: "white", bg: "#FF4D00" },
                  { label: "Medium Risk", value: stats.medium_risk, color: "white", bg: "#FFAB00" },
                  { label: "Low Risk", value: stats.low_risk, color: "white", bg: "#0870FF" },
                ].map((seg) => (
                  <div key={seg.label} className="text-center rounded-[10px] p-3" style={{ background: seg.bg }}>
                    <p className="text-lg font-black" style={{ color: seg.color }}>{seg.value.toLocaleString()}</p>
                    <p className="text-[10px] font-semibold mt-0.5" style={{ color: seg.color }}>{seg.label}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.8)" }}>
                      {stats.total_customers > 0 ? ((seg.value / stats.total_customers) * 100).toFixed(0) : 0}%
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">ไม่มีข้อมูล</p>
          )}
        </div>
      </div>

      {/* Model Details */}
      {/* Model Details */}
      {info && (
        <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-[8px] bg-blue-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="5" r="3" /><circle cx="5" cy="19" r="3" /><circle cx="19" cy="19" r="3" />
                <line x1="12" y1="8" x2="12" y2="14" /><line x1="12" y1="14" x2="5" y2="16" /><line x1="12" y1="14" x2="19" y2="16" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">sklearn Pipeline</h3>
              <p className="text-xs text-gray-400">{info.classifier}</p>
            </div>
          </div>
          <div className="space-y-2">
            {[
              ["Model Type", info.model_type],
              ["Classifier", info.classifier],
              ["N Estimators", info.n_estimators ?? "—"],
              ["Max Depth", info.max_depth ?? "None (unlimited)"],
              ["N Features", info.n_features],
              ["Test AUC", info.test_auc ?? "— (import data first)"],
              ["SHAP Available", info.shap_available ? "Yes" : "No"],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-xs text-gray-500">{k}</span>
                <span className="text-xs font-mono font-bold text-gray-800">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feature Columns */}
      {info?.features && (
        <div className="bg-white rounded-[16px] border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-6">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Feature Columns (Input Order)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {info.features.map((f: string, i: number) => (
              <div key={f} className="bg-gray-50 border border-gray-100 rounded-[8px] px-3 py-2 flex items-center gap-2">
                <span className="text-[10px] text-gray-400 font-mono w-4">{i + 1}.</span>
                <span className="text-xs text-gray-700 font-mono truncate">{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
