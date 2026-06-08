"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Phone, Mail, Send, AlertTriangle, ChevronRight,
  CalendarClock, Banknote, ShieldCheck, Activity,
} from "lucide-react";
import {
  PageHeader, SectionCard, StatusPill, ProgressMeter, Skeleton, EmptyState,
  lifecycleTone,
} from "@/components/ui";
import { fetchCustomer, fetchCustomerExplain } from "@/lib/api";
import { formatFeatureLabel } from "@/lib/featureLabels";
import { useRunStore } from "@/lib/runStore";

export default function Customer360() {
  const params = useParams();
  const accId  = params.id as string;
  const { runId } = useRunStore();
  const [c, setC] = useState<any>(null);
  const [explain, setExplain] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!runId || !accId) return;
    setLoading(true); setError("");
    Promise.all([
      fetchCustomer(runId, accId),
      fetchCustomerExplain(runId, accId),
    ]).then(([d, exp]) => { setC(d); setExplain(exp); setLoading(false); })
      .catch(() => { setError("ไม่พบลูกค้า"); setLoading(false); });
  }, [runId, accId]);

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-24" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-72" /><Skeleton className="h-72" /><Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  if (error) return <div className="p-8"><EmptyState title={error} icon={AlertTriangle} /></div>;
  if (!c) return null;

  const stage = c.lifecycle_stage;

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow={
          <Link href="/customers" className="inline-flex items-center gap-1 text-[color:var(--moby-700)] hover:underline">
            <ArrowLeft size={11} /> Customers
          </Link>
        }
        title={`Account ${c.acc_id}`}
        actions={
          <div className="flex items-center gap-2">
            <ActionBtn icon={Phone}>Log call</ActionBtn>
            <ActionBtn icon={Mail}>Send email</ActionBtn>
            <ActionBtn icon={Send} primary>Trigger campaign</ActionBtn>
          </div>
        }
      />

      <div className="px-8 mt-4 space-y-5">
        {/* Account brief */}
        <div className="surface p-5">
          <div className="flex items-center gap-5 flex-wrap">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[color:var(--moby-600)] to-[color:var(--moby-800)] text-white grid place-items-center font-semibold text-[18px]">
              {String(c.acc_id).slice(-2)}
            </div>
            <div className="flex-1 min-w-[260px]">
              <div className="flex items-center flex-wrap gap-2">
                <StatusPill tone={lifecycleTone(stage)}>{stage}</StatusPill>
                {c.sub_stage && <StatusPill tone="neutral" dot={false}>{c.sub_stage}</StatusPill>}
              </div>
              <div className="mt-2 flex items-center gap-4 text-[12px] text-[color:var(--ink-4)] flex-wrap">
                <span><span className="text-[color:var(--ink-5)]">Purchases</span> <b className="num text-[color:var(--ink-2)]">{c.n_purchases || 0}</b></span>
                <span><span className="text-[color:var(--ink-5)]">Total revenue</span> <b className="num text-[color:var(--ink-2)]">{Number(c.total_revenue || 0).toLocaleString()} ฿</b></span>
                {c.days_since_last_activity != null && (
                  <span><span className="text-[color:var(--ink-5)]">Inactive</span> <b className="num text-[color:var(--ink-2)]">{c.days_since_last_activity} days</b></span>
                )}
              </div>
            </div>
                      </div>
        </div>

        
        {/* Active Paid layout */}
        {stage === "Active Paid" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* Churn */}
            <SectionCard title="Churn analysis" hint="ความน่าจะเป็นที่จะเลิกใช้ใน 6 เดือน">
              <ChurnGauge value={c.churn_probability || 0} />
              <div className="mt-5 space-y-3">
                <KV label="P(alive)" value={c.p_alive != null ? `${(c.p_alive * 100).toFixed(1)}%` : "—"} />
                {explain?.top_risk_factors?.length > 0 && (
                  <div className="pt-2 border-t border-[color:var(--line)]">
                    <div className="text-[10.5px] uppercase tracking-[.10em] text-[color:var(--ink-5)] mb-2">Risk factors</div>
                    {(Array.isArray(explain?.top_risk_factors) ? explain.top_risk_factors : []).map((f: any, i: number) => (
                      <div key={i} className="text-[12px] text-[color:var(--ink-3)] mb-1 flex items-start gap-1.5">
                        <span className="text-[color:var(--warn)] mt-0.5">·</span>
                        <span>{formatFeatureLabel(f.feature, f.feature_value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>

            {/* CLV */}
            <SectionCard title="Lifetime value" hint="คาดการณ์ 6 เดือนข้างหน้า">
              <div>
                <div className="text-[11px] uppercase tracking-[.12em] text-[color:var(--ink-5)]">Predicted CLV</div>
                <div className="num text-[28px] font-semibold text-[color:var(--ink-1)] mt-0.5">
                  {Number(c.predicted_clv_6m || 0).toLocaleString()} <span className="text-[14px] text-[color:var(--ink-4)]">฿</span>
                </div>
                {c.clv_ci95_lo != null && (
                  <div className="text-[11.5px] text-[color:var(--ink-5)] mt-1 num">
                    95% CI: {Number(c.clv_ci95_lo).toLocaleString()} – {Number(c.clv_ci95_hi).toLocaleString()} ฿
                  </div>
                )}
              </div>
              {c.clv_ci95_lo != null && (
                <CIBar
                  lo80={c.clv_ci80_lo} hi80={c.clv_ci80_hi}
                  lo95={c.clv_ci95_lo} hi95={c.clv_ci95_hi}
                  point={c.predicted_clv_6m}
                />
              )}
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-[color:var(--line)]">
                <KV label="Revenue at risk" value={c.revenue_at_risk != null ? `${Number(c.revenue_at_risk || 0).toLocaleString()} ฿` : "—"} accent="rose" />
                <KV label="Avg txn value" value={c.avg_transaction_value != null ? `${Number(c.avg_transaction_value || 0).toLocaleString()} ฿` : "—"} />
              </div>
            </SectionCard>

            {/* Credit */}
            <SectionCard title="Credit forecast" hint="ทำนายว่าจะซื้อเครดิตอีกในกี่วัน">
              {c.credit_p50 != null ? (
                <>
                  <div className="mt-5 space-y-3">
                    <QuantileBar label="Optimistic (P10)" value={c.credit_p10} max={c.credit_p90} tone="ok" />
                    <QuantileBar label="Early (P25)" value={c.credit_p25} max={c.credit_p90} tone="info" />
                    <QuantileBar label="Likely (P50)" value={c.credit_p50} max={c.credit_p90} tone="brand" highlight />
                    <QuantileBar label="Late (P75)" value={c.credit_p75} max={c.credit_p90} tone="warn" />
                    <QuantileBar label="Pessimistic (P90)" value={c.credit_p90} max={c.credit_p90} tone="danger" />
                  </div>
                  <div className="mt-4 text-[11.5px] text-[color:var(--ink-5)]">
                    forecast confidence{" "}
                    <b className="num text-[color:var(--ink-3)]">{c.forecast_confidence != null ? (c.forecast_confidence * 100).toFixed(0) + "%" : "—"}</b>
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={Banknote}
                  title="ยังไม่มีพยากรณ์เครดิต"
                  hint={c.n_purchases <= 1 ? "ลูกค้ายังซื้อแค่ครั้งเดียว — ต้องมี ≥ 2 transaction" : "ไม่มีข้อมูลเพียงพอ"}
                />
              )}
            </SectionCard>
          </div>
        )}

        {/* Churned layout */}
        {stage === "Churned" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <SectionCard title="Past engagement">
              <div className="space-y-3">
                <KV label="Ever paid" value={c.ever_paid ? "Yes" : "No"} />
                <KV label="Total revenue" value={`${Number(c.total_revenue || 0).toLocaleString()} ฿`} />
                <KV label="Days since last activity" value={c.days_since_last_activity ?? "—"} />
                <KV label="Past purchases" value={c.n_purchases || 0} />
              </div>
            </SectionCard>
            <SectionCard title="Recommended next step">
              <EmptyState
                icon={CalendarClock}
                title="ใช้ playbook จาก lifecycle stage"
                hint="ใช้ action จาก churn/CLV/credit และประวัติการใช้งานก่อน"
              />
            </SectionCard>
          </div>
        )}

        {/* Active Free */}
        {stage === "Active Free" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <SectionCard title="Engagement summary">
              <div className="space-y-3">
                <KV label="Is active" value={c.is_active ? "Yes" : "No"} />
                <KV label="Days since last activity" value={c.days_since_last_activity ?? "—"} />
                <KV label="Ever paid" value={c.ever_paid ? "Yes" : "No"} />
                <KV label="Total revenue" value={`${Number(c.total_revenue || 0).toLocaleString()} ฿`} />
              </div>
            </SectionCard>
            <SectionCard title="Recommended next step">
              <EmptyState
                icon={Activity}
                title="ใช้ engagement summary"
                hint="ใช้ usage/engagement summary และ campaign playbook โดยไม่อ้าง model ที่อยู่นอก scope ML v2"
              />
            </SectionCard>
          </div>
        )}

        {/* Ghost */}
        {stage === "Ghost" && (
          <SectionCard title="Ghost account">
            <EmptyState
              icon={Activity}
              title="สมัครแล้วแต่ยังไม่ใช้งาน"
              hint="รอให้ลูกค้าเริ่มใช้งาน"
            />
          </SectionCard>
        )}

        {/* Footer · model lineage */}
        <div className="text-[11px] text-[color:var(--ink-5)] flex items-center gap-3 px-1">
          <ShieldCheck size={11} /> Output from lifecycle / churn / clv / credit components
          <span className="opacity-50">·</span>
          point-in-time safe (cutoff respected)
          <span className="opacity-50">·</span>
          SHAP-based factor explanations
        </div>
      </div>
    </div>
  );
}

/* ── inner ──────────────────────────────────────── */

function ActionBtn({ icon: Icon, children, primary }: any) {
  return (
    <button className={`h-9 px-3 rounded-lg text-[13px] inline-flex items-center gap-1.5 ${
      primary
        ? "bg-[color:var(--moby-600)] text-white hover:bg-[color:var(--moby-700)]"
        : "border border-[color:var(--line)] bg-white text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)]"
    }`}>
      <Icon size={14} /> {children}
    </button>
  );
}

function ChurnGauge({ value, label = "Churn probability", tone = "auto" }: { value: number; label?: string; tone?: "auto" | "warn" | "violet" }) {
  const pct = Math.max(0, Math.min(1, value));
  const color = tone === "warn" ? "var(--warn)"
    : tone === "violet" ? "#7c3aed"
    : pct > 0.6 ? "var(--danger)"
    : pct > 0.3 ? "var(--warn)"
    : "var(--ok)";
  const r = 70;
  const cx = 90, cy = 90;
  const start = polar(cx, cy, r, 180);
  const end   = polar(cx, cy, r, 360);
  const cur   = polar(cx, cy, r, 180 + pct * 180);
  return (
    <div className="text-center">
      <svg width="180" height="100" viewBox="0 0 180 100">
        <path d={`M${start.x},${start.y} A${r},${r} 0 0 1 ${end.x},${end.y}`} fill="none" stroke="var(--line-2)" strokeWidth="10" strokeLinecap="round" />
        <path d={`M${start.x},${start.y} A${r},${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${cur.x},${cur.y}`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" />
      </svg>
      <div className="num text-[32px] font-semibold leading-none mt-1" style={{ color }}>
        {(pct * 100).toFixed(1)}%
      </div>
      <div className="text-[11.5px] text-[color:var(--ink-5)] mt-1">{label}</div>
    </div>
  );
}
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function KV({ label, value, accent }: { label: string; value: any; accent?: "rose" | "ok" | "blue" }) {
  const color = accent === "rose" ? "var(--danger)" : accent === "ok" ? "var(--ok)" : accent === "blue" ? "var(--moby-700)" : "var(--ink-1)";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[.10em] text-[color:var(--ink-5)]">{label}</div>
      <div className="num text-[16px] font-semibold mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}

function CIBar({ lo80, hi80, lo95, hi95, point }: any) {
  const min = lo95, max = hi95, range = max - min || 1;
  const pos = (v: number) => ((v - min) / range) * 100;
  return (
    <div className="mt-4">
      <div className="relative h-3 rounded-full bg-[color:var(--surface-2)] overflow-hidden">
        <div className="absolute top-0 bottom-0 bg-[color:var(--moby-100)]" style={{ left: 0, right: 0 }} />
        <div className="absolute top-0 bottom-0 bg-[color:var(--moby-200)]" style={{ left: `${pos(lo80)}%`, right: `${100 - pos(hi80)}%` }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[color:var(--moby-700)]" style={{ left: `calc(${pos(point)}% - 1px)` }} />
      </div>
      <div className="flex justify-between text-[10.5px] text-[color:var(--ink-5)] num mt-1.5">
        <span>{Number(lo95).toLocaleString()}</span>
        <span>{Number(hi95).toLocaleString()}</span>
      </div>
    </div>
  );
}

function RFMBar({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] text-[color:var(--ink-4)]">{label}</span>
        <span className="num text-[12px] text-[color:var(--ink-2)]">{v}/5</span>
      </div>
      <ProgressMeter value={v} max={5} tone="blue" showValue={false} />
    </div>
  );
}

function QuantileBar({ label, value, max, tone, highlight }: any) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = ({ ok: "var(--ok)", info: "var(--info)", brand: "var(--moby-600)", warn: "var(--warn)", danger: "var(--danger)" } as any)[tone];
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className={`text-[11.5px] ${highlight ? "font-medium text-[color:var(--ink-1)]" : "text-[color:var(--ink-4)]"}`}>{label}</span>
        <span className="num text-[12px] text-[color:var(--ink-2)]">{Number(value).toFixed(0)} days</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-[color:var(--surface-2)] overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
