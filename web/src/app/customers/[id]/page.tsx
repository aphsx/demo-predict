"use client";
import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Badge from "@/components/Badge";
import { api, Prediction } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell
} from "recharts";
import { ArrowLeft, User, TrendingDown, DollarSign, Calendar, AlertTriangle } from "lucide-react";
import Link from "next/link";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <h2 className="font-semibold text-gray-800 mb-4 text-base">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-medium ${highlight ? "text-blue-700" : "text-gray-900"}`}>
        {value}
      </span>
    </div>
  );
}

function ChurnGauge({ prob }: { prob: number }) {
  const pct   = Math.round(prob * 100);
  const color = prob > 0.6 ? "#ef4444" : prob > 0.3 ? "#f59e0b" : "#22c55e";
  const r = 54, cx = 70, cy = 70;
  const circ = 2 * Math.PI * r;
  const dash  = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="100" viewBox="0 0 140 100">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="10"
                strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
                strokeDashoffset={circ * 0.125} strokeLinecap="round" transform="rotate(135 70 70)" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10"
                strokeDasharray={`${dash * 0.75} ${circ}`}
                strokeDashoffset={circ * 0.125} strokeLinecap="round" transform="rotate(135 70 70)" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22" fontWeight="700" fill={color}>{pct}%</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="11" fill="#9ca3af">Churn Risk</text>
      </svg>
    </div>
  );
}

function CreditForecast({ p }: { p: Prediction }) {
  if (!p.credit_p50) return <p className="text-gray-400 text-sm">ไม่มีข้อมูล (ซื้อครั้งแรก)</p>;
  const data = [
    { name: "P10", days: Math.round(p.credit_p10 ?? 0), fill: "#93c5fd" },
    { name: "P25", days: Math.round(p.credit_p25 ?? 0), fill: "#60a5fa" },
    { name: "P50", days: Math.round(p.credit_p50 ?? 0), fill: "#2563eb" },
    { name: "P75", days: Math.round(p.credit_p75 ?? 0), fill: "#1d4ed8" },
    { name: "P90", days: Math.round(p.credit_p90 ?? 0), fill: "#1e3a8a" },
  ];
  return (
    <div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 5, bottom: 5 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit=" วัน" />
          <Tooltip formatter={(v: any) => [`${v} วัน`]} />
          <Bar dataKey="days" radius={[4,4,0,0]}>
            {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Bar>
          <ReferenceLine y={p.credit_p50} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: "P50", fontSize: 10 }} />
        </BarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-3 gap-2 mt-2 text-center text-xs">
        <div className="bg-blue-50 rounded-lg py-2">
          <div className="font-bold text-blue-800">{Math.round(p.credit_p25 ?? 0)} วัน</div>
          <div className="text-blue-500">P25 (alert)</div>
        </div>
        <div className="bg-blue-100 rounded-lg py-2">
          <div className="font-bold text-blue-900">{Math.round(p.credit_p50 ?? 0)} วัน</div>
          <div className="text-blue-600">P50 (best guess)</div>
        </div>
        <div className="bg-blue-50 rounded-lg py-2">
          <div className="font-bold text-blue-800">{Math.round(p.credit_p75 ?? 0)} วัน</div>
          <div className="text-blue-500">P75 (late)</div>
        </div>
      </div>
    </div>
  );
}

function CLVBar({ p }: { p: Prediction }) {
  if (!p.predicted_clv_6m) return <p className="text-gray-400 text-sm">ไม่มีข้อมูล</p>;
  const max = (p.clv_ci95_hi ?? p.predicted_clv_6m) * 1.1;
  const toW = (v: number) => `${Math.round((v / max) * 100)}%`;
  return (
    <div className="space-y-2">
      <div className="relative h-8 bg-gray-100 rounded-full overflow-hidden">
        <div className="absolute h-full bg-blue-100 rounded-full"
             style={{ left: toW(p.clv_ci95_lo ?? 0), width: toW((p.clv_ci95_hi ?? 0) - (p.clv_ci95_lo ?? 0)) }} />
        <div className="absolute h-full bg-blue-300 rounded-full"
             style={{ left: toW(p.clv_ci80_lo ?? 0), width: toW((p.clv_ci80_hi ?? 0) - (p.clv_ci80_lo ?? 0)) }} />
        <div className="absolute top-1 bottom-1 w-1.5 bg-blue-700 rounded-full"
             style={{ left: `calc(${toW(p.predicted_clv_6m)} - 3px)` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>฿{Math.round(p.clv_ci95_lo ?? 0).toLocaleString()} (95% lo)</span>
        <span className="font-semibold text-blue-700">฿{Math.round(p.predicted_clv_6m).toLocaleString()} (predict)</span>
        <span>฿{Math.round(p.clv_ci95_hi ?? 0).toLocaleString()} (95% hi)</span>
      </div>
      <div className="flex gap-3 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-blue-100 inline-block" />95% CI</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-blue-300 inline-block" />80% CI</span>
        <span className="flex items-center gap-1"><span className="w-1 h-3 rounded bg-blue-700 inline-block" />Prediction</span>
      </div>
    </div>
  );
}

function CustomerContent() {
  const { id }    = useParams<{ id: string }>();
  const params    = useSearchParams();
  const runId     = params.get("run") ?? "";
  const [p, setP] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId || !id) return;
    api.getCustomer(runId, Number(id))
       .then(setP)
       .finally(() => setLoading(false));
  }, [id, runId]);

  const pct  = (n?: number | null) => n == null ? "—" : `${(n * 100).toFixed(1)}%`;
  const baht = (n?: number | null) => n == null ? "—" : `฿${Math.round(n).toLocaleString()}`;

  if (loading) return (
    <div className="flex h-screen"><Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400">กำลังโหลด...</div>
    </div>
  );
  if (!p) return (
    <div className="flex h-screen"><Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400">ไม่พบข้อมูลลูกค้า</div>
    </div>
  );

  const actionText = () => {
    if (p.churn_tier === "High" && p.urgency === "Critical") return "รีบโทรทันที — เสี่ยง Churn + ใกล้หมดเครดิต";
    if (p.churn_tier === "High")    return "โทรสอบถาม + เสนอ Special Offer";
    if (p.urgency === "Critical")   return "ส่ง Reminder ซื้อเครดิต — ใกล้ถึงรอบซื้อ";
    if (p.rfm_segment === "Champions" || p.rfm_segment === "Loyal") return "Cross-sell / Upsell — ลูกค้า VIP";
    return "Monitor — ไม่มี Action เร่งด่วน";
  };

  const riskFactors = [p.risk_factor_1, p.risk_factor_2, p.risk_factor_3].filter(Boolean);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href={`/customers?run=${runId}`}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <User size={18} className="text-blue-600" />
                ลูกค้า #{p.acc_id}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge label={p.churn_tier ?? "—"} />
                <Badge label={p.rfm_segment ?? "—"} />
                {p.urgency && <Badge label={p.urgency} />}
                <span className="text-xs text-gray-400">
                  Priority: <strong>{p.priority_score?.toFixed(1) ?? "—"}</strong>/10
                </span>
              </div>
            </div>
            {/* Action box */}
            <div className="ml-auto bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 max-w-sm">
              <p className="text-xs text-blue-500 font-medium">คำแนะนำ Sales</p>
              <p className="text-sm font-semibold text-blue-900 mt-0.5">{actionText()}</p>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left column */}
          <div className="space-y-5">
            {/* Churn gauge */}
            <Section title="Churn Prediction">
              <ChurnGauge prob={p.churn_probability ?? 0} />
              {riskFactors.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase">ปัจจัยเสี่ยงหลัก</p>
                  {riskFactors.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 bg-red-50 rounded-lg px-3 py-2">
                      <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
                      <span className="text-xs text-red-700">{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Key stats */}
            <Section title="ข้อมูลสำคัญ">
              <Row label="Status" value={<Badge label={p.is_active ? "Active" : "Churned"} />} />
              <Row label="Revenue at Risk" value={baht(p.revenue_at_risk)} highlight />
              <Row label="Priority Score"  value={`${p.priority_score?.toFixed(2) ?? "—"} / 10`} highlight />
              <Row label="จำนวนซื้อ"       value={`${p.n_purchases ?? 0} ครั้ง`} />
              <Row label="Forecast confidence" value={pct(p.forecast_confidence)} />
            </Section>
          </div>

          {/* Middle column */}
          <div className="space-y-5">
            {/* CLV */}
            <Section title="Customer Lifetime Value (6 เดือน)">
              <Row label="Predicted CLV" value={baht(p.predicted_clv_6m)} highlight />
              <Row label="P(alive)"       value={pct(p.p_alive)} />
              <Row label="RFM Segment"    value={<Badge label={p.rfm_segment ?? "—"} />} />
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-2">Confidence Interval</p>
                <CLVBar p={p} />
              </div>
            </Section>

            {/* RFM scores */}
            <Section title="RFM Scores">
              {[
                { label: "R (Recency)", val: p.r_score, max: 5, color: "bg-blue-500" },
                { label: "F (Frequency)", val: p.f_score, max: 5, color: "bg-indigo-500" },
                { label: "M (Monetary)", val: p.m_score, max: 5, color: "bg-purple-500" },
              ].map(({ label, val, max, color }) => (
                <div key={label} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium">{val ?? "—"} / {max}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full">
                    <div className={`h-2 rounded-full ${color}`}
                         style={{ width: val ? `${(val / max) * 100}%` : "0%" }} />
                  </div>
                </div>
              ))}
            </Section>
          </div>

          {/* Right column */}
          <div className="space-y-5">
            {/* Credit forecast */}
            <Section title="Credit Purchase Forecast">
              <div className="flex items-center justify-between mb-3">
                <Badge label={p.urgency ?? "—"} />
                {p.alert_date && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Calendar size={12} />
                    Alert: {p.alert_date}
                  </div>
                )}
              </div>
              <CreditForecast p={p} />
            </Section>

            {/* CI table */}
            <Section title="Quantile Details">
              {[
                { label: "P10 (เร็วสุด)", v: p.credit_p10, note: "warm up" },
                { label: "P25 (alert)",   v: p.credit_p25, note: "เริ่มโทร", bold: true },
                { label: "P50 (best)",    v: p.credit_p50, note: "target date", bold: true },
                { label: "P75 (late)",    v: p.credit_p75, note: "อาจช้ากว่า" },
                { label: "P90 (ช้าสุด)", v: p.credit_p90, note: "pessimistic" },
              ].map(({ label, v, note, bold }) => (
                <div key={label} className={`flex justify-between py-1.5 text-sm border-b last:border-0 ${bold ? "font-semibold" : ""}`}>
                  <span className="text-gray-600">{label}</span>
                  <span className="text-right">
                    {v ? `${Math.round(v)} วัน` : "—"}
                    <span className="text-xs text-gray-400 ml-1">({note})</span>
                  </span>
                </div>
              ))}
            </Section>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function CustomerPage() {
  return <Suspense><CustomerContent /></Suspense>;
}
