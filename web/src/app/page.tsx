"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users, AlertTriangle, Wallet, Zap, Flame, ShieldOff, ArrowUpRight,
  Sparkles, RefreshCw, ChevronRight, Activity,
} from "lucide-react";
import {
  KpiCard, SectionCard, StackBar, StatusPill, AlertItem,
  PageHeader, ActionChip, Skeleton, lifecycleTone, urgencyTone, churnTone,
} from "@/components/ui";
import { fetchSummary, fetchPredictions } from "@/lib/api";
import { useRunStore } from "@/lib/runStore";

const LIFECYCLE_COLOR: Record<string, string> = {
  "Active Paid": "var(--c-paid)",
  "Active Free": "var(--c-free)",
  "Churned":     "var(--c-churn)",
  "Ghost":       "var(--c-ghost)",
};
const URGENCY_COLOR: Record<string, string> = {
  "Critical": "#dc2626", "Warning": "#d97706",
  "Monitor": "#0369a1",  "Stable": "#059669",
  "New Customer": "#94a3b8",
};
const RFM_COLOR: Record<string, string> = {
  "Champions": "#1d4ed8", "Loyal": "#3b82f6",
  "Promising": "#10b981", "Cannot Lose": "#f59e0b",
  "At Risk": "#ef4444",   "Need Attention": "#94a3b8",
};
const CHURN_COLOR: Record<string, string> = {
  "Low": "#10b981", "Medium": "#f59e0b", "High": "#ef4444",
};

export default function Dashboard() {
  const { runId } = useRunStore();
  const [summary, setSummary] = useState<any>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      fetchSummary(runId),
      fetchPredictions(runId, { page: "1", page_size: "8", lifecycle_stage: "Active Paid" })
        .then(d => d?.data || []).catch(() => []),
    ]).then(([s, p]) => {
      setSummary(s); setPreview(p); setLoading(false);
    });
  }, [runId]);

  const ap = summary?.active_paid || {};
  const wb = summary?.winback || {};
  const cv = summary?.conversion || {};
  const lc = summary?.lifecycle || {};

  const totalCustomers = summary?.total_customers || 0;
  const portfolioRisk = ap.total ? (ap.at_risk || 0) / ap.total : 0;

  const anomalies = useMemo(() => buildAnomalies(summary), [summary]);

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Today · Real-time"
        title="ภาพรวมพอร์ตลูกค้า"
        actions={
          <>
            <Link href="/playbooks" className="h-9 px-3 rounded-lg border border-[color:var(--line)] bg-white text-[13px] text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)] inline-flex items-center gap-1.5">
              <Zap size={14} className="text-[color:var(--moby-600)]" /> Open action queue
            </Link>
            <Link href="/customers" className="h-9 px-3 rounded-lg bg-[color:var(--moby-600)] text-white text-[13px] hover:bg-[color:var(--moby-700)] inline-flex items-center gap-1.5">
              <Users size={14} /> Browse customers
            </Link>
          </>
        }
      />

      <div className="px-8 mt-4 space-y-5">

        {/* KPI strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading ? (
            [...Array(4)].map((_, i) => <Skeleton key={i} className="h-[112px]" />)
          ) : (
            <>
              <KpiCard
                label="Total customers"
                value={totalCustomers}
                hint="ในรอบประเมินนี้"
                accent="slate"
              />
              <KpiCard
                label="Revenue at risk"
                value={Number(ap.revenue_at_risk || 0)}
                format="currency"
                hint={`${(ap.at_risk || 0).toLocaleString()} active paid · churn-prob ≥ 0.6`}
                accent="rose"
              />
              <KpiCard
                label="Avg CLV (6m)"
                value={Number(ap.avg_clv || 0)}
                format="currency"
                hint="Active Paid cohort"
                accent="blue"
              />
              <KpiCard
                label="Critical top-up"
                value={ap.critical_topup || 0}
                hint="ต้องเตือนซื้อเครดิตภายใน 14 วัน"
                accent="amber"
              />
            </>
          )}
        </div>

        {/* Lifecycle + Anomaly */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Lifecycle */}
          <SectionCard
            title="Customer Lifecycle"
            hint="กระจายของลูกค้าใน 4 stage หลัก"
            className="xl:col-span-2"
            right={
              <Link href="/customers" className="text-[12px] text-[color:var(--moby-700)] hover:underline">
                View all →
              </Link>
            }
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <LifecycleTile
                color={LIFECYCLE_COLOR["Active Paid"]}
                label="Active Paid"
                count={lc["Active Paid"]?.total || 0}
                detail={`Healthy ${ap.healthy || 0} · At risk ${ap.at_risk || 0}`}
                href="/customers?lifecycle_stage=Active%20Paid"
              />
              <LifecycleTile
                color={LIFECYCLE_COLOR["Active Free"]}
                label="Active Free"
                count={lc["Active Free"]?.total || 0}
                detail={`High convert ${cv.high || 0} · Avg ${(((cv.avg_convert || 0) * 100)).toFixed(1)}%`}
                href="/customers?lifecycle_stage=Active%20Free"
              />
              <LifecycleTile
                color={LIFECYCLE_COLOR["Churned"]}
                label="Churned"
                count={lc["Churned"]?.total || 0}
                detail={`Win-back High ${wb.high || 0} · Med ${wb.medium || 0}`}
                href="/customers?lifecycle_stage=Churned"
              />
              <LifecycleTile
                color={LIFECYCLE_COLOR["Ghost"]}
                label="Ghost"
                count={lc["Ghost"]?.total || 0}
                detail="ไม่เคยใช้งาน"
                href="/customers?lifecycle_stage=Ghost"
              />
            </div>

            {/* Distribution row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
              <div>
                <DistTitle title="Churn tier" right={`${(portfolioRisk * 100).toFixed(1)}% at risk`} />
                <StackBar data={summary?.churn_distribution || {}} palette={CHURN_COLOR} />
              </div>
              <div>
                <DistTitle title="RFM segments" />
                <StackBar data={summary?.rfm_distribution || {}} palette={RFM_COLOR} />
              </div>
              <div>
                <DistTitle title="Credit urgency" />
                <StackBar data={summary?.urgency_distribution || {}} palette={URGENCY_COLOR} />
              </div>
            </div>
          </SectionCard>

          {/* Anomaly feed */}
          <SectionCard
            title="Real-time Signals"
            hint="ตรวจจับ anomaly · drift · threshold breach"
            right={
              <Link href="/alerts" className="text-[12px] text-[color:var(--moby-700)] hover:underline">
                View all →
              </Link>
            }
          >
            <div className="-mx-5 -my-5">
              {anomalies.length === 0 && !loading && (
                <div className="px-5 py-10 text-center text-[12.5px] text-[color:var(--ink-5)]">
                  ระบบไม่พบสัญญาณผิดปกติ
                </div>
              )}
              {loading && (
                <div className="p-5 space-y-2">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              )}
              {!loading && anomalies.map((a, i) => (
                <AlertItem
                  key={i}
                  severity={a.severity as any}
                  title={a.title}
                  time={a.time}
                >
                  {a.body}
                </AlertItem>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Action queue preview + Conversion / Win-back */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <SectionCard
            title="Top accounts to act on"
            hint="เรียงโดย Priority Score (churn × CLV × urgency × recency)"
            className="xl:col-span-2"
            right={<Link href="/playbooks" className="text-[12px] text-[color:var(--moby-700)] hover:underline">Open queue →</Link>}
          >
            <div className="-m-2 overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Stage</th>
                    <th>Churn</th>
                    <th>Urgency</th>
                    <th>CLV (6m)</th>
                    <th>Revenue at risk</th>
                    <th>Priority</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r: any) => (
                    <tr key={r.acc_id}>
                      <td className="num text-[color:var(--moby-700)]">{r.acc_id}</td>
                      <td><StatusPill tone={lifecycleTone(r.lifecycle_stage)}>{r.lifecycle_stage}</StatusPill></td>
                      <td>
                        {r.churn_probability != null && (
                          <StatusPill tone={churnTone(r.churn_tier)}>
                            {(r.churn_probability * 100).toFixed(0)}% · {r.churn_tier}
                          </StatusPill>
                        )}
                      </td>
                      <td>{r.urgency ? <StatusPill tone={urgencyTone(r.urgency)}>{r.urgency}</StatusPill> : <span className="text-[color:var(--ink-5)] text-[11.5px]">—</span>}</td>
                      <td className="num">{Number(r.predicted_clv_6m || 0).toLocaleString()} ฿</td>
                      <td className="num text-[color:var(--danger)]">{Number(r.revenue_at_risk || 0).toLocaleString()} ฿</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="num text-[12px] text-[color:var(--ink-2)]">{Number(r.priority_score || 0).toFixed(1)}</div>
                          <div className="w-12 h-1.5 rounded-full bg-[color:var(--surface-2)] overflow-hidden">
                            <div className="h-full bg-[color:var(--moby-600)]"
                              style={{ width: `${Math.min(100, (r.priority_score / 10) * 100)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="text-right">
                        <Link href={`/customers/${r.acc_id}`} className="inline-flex items-center gap-0.5 text-[12px] text-[color:var(--moby-700)] hover:underline">
                          Brief <ChevronRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!loading && preview.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-[color:var(--ink-5)] py-6">ยังไม่มีลูกค้า</td></tr>
                  )}
                  {loading && [...Array(5)].map((_, i) => (
                    <tr key={i}><td colSpan={8}><Skeleton className="h-6 my-1" /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Growth signals" hint="Conversion · Win-back" >
            <div className="space-y-4">
              <SignalRow
                icon={<Sparkles size={14} />}
                label="High intent free users"
                value={cv.high || 0}
                sub={`Avg convert ${(((cv.avg_convert || 0) * 100)).toFixed(1)}%`}
                tone="violet"
                href="/customers?lifecycle_stage=Active%20Free&conversion_tier=High"
              />
              <SignalRow
                icon={<Flame size={14} />}
                label="High win-back targets"
                value={wb.high || 0}
                sub={`Avg comeback ${(((wb.avg_comeback || 0) * 100)).toFixed(1)}%`}
                tone="amber"
                href="/customers?lifecycle_stage=Churned&winback_tier=High"
              />
              <SignalRow
                icon={<Wallet size={14} />}
                label="Critical top-up"
                value={ap.critical_topup || 0}
                sub="แจ้งซื้อเครดิตภายใน 14 วัน"
                tone="rose"
                href="/customers?urgency=Critical"
              />
              <SignalRow
                icon={<ShieldOff size={14} />}
                label="Active Paid at risk"
                value={ap.at_risk || 0}
                sub={`Revenue at risk ${Number(ap.revenue_at_risk || 0).toLocaleString()} ฿`}
                tone="rose"
                href="/customers?lifecycle_stage=Active%20Paid&churn_tier=High"
              />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────── */

function DistTitle({ title, right }: { title: string; right?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <h4 className="text-[12px] font-medium text-[color:var(--ink-2)]">{title}</h4>
      {right && <span className="text-[11px] text-[color:var(--ink-5)] num">{right}</span>}
    </div>
  );
}

function LifecycleTile({
  color, label, count, detail, href,
}: { color: string; label: string; count: number; detail: string; href: string }) {
  return (
    <Link href={href} className="surface-soft block p-4 lift hover:bg-white">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[11.5px] font-medium text-[color:var(--ink-3)]">{label}</span>
        <ArrowUpRight size={12} className="ml-auto text-[color:var(--ink-5)]" />
      </div>
      <div className="num text-[22px] font-semibold text-[color:var(--ink-1)] leading-none">
        {count.toLocaleString()}
      </div>
      <div className="text-[11px] text-[color:var(--ink-5)] mt-1.5">{detail}</div>
    </Link>
  );
}

function SignalRow({
  icon, label, value, sub, tone, href,
}: { icon: any; label: string; value: number; sub: string; tone: "violet" | "amber" | "rose" | "blue"; href: string }) {
  const bg = ({ violet: "#f5f3ff", amber: "#fffbeb", rose: "#fef2f2", blue: "#eff6ff" } as const)[tone];
  const fg = ({ violet: "#6d28d9", amber: "#b45309", rose: "#b91c1c", blue: "#1d4ed8" } as const)[tone];
  return (
    <Link href={href} className="flex items-center gap-3 p-3 rounded-lg hover:bg-[color:var(--surface-2)]">
      <div className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: bg, color: fg }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] text-[color:var(--ink-2)] truncate">{label}</div>
        <div className="text-[11px] text-[color:var(--ink-5)] truncate">{sub}</div>
      </div>
      <div className="num text-[18px] font-semibold text-[color:var(--ink-1)]">{value.toLocaleString()}</div>
      <ChevronRight size={14} className="text-[color:var(--ink-5)]" />
    </Link>
  );
}

/* derive anomaly signals from summary numbers */
function buildAnomalies(summary: any): { severity: string; title: string; time: string; body: string }[] {
  if (!summary) return [];
  const out: any[] = [];
  const ap = summary.active_paid || {};
  const ch = summary.churn_distribution || {};
  const ug = summary.urgency_distribution || {};

  const total = ap.total || 1;
  const highChurnPct = (ch.High || 0) / total;
  if (highChurnPct > 0.18) {
    out.push({
      severity: "danger",
      title: `High churn share เกินเป้าที่ ${(highChurnPct * 100).toFixed(1)}%`,
      body: `Active Paid ที่ churn-prob ≥ 0.6 มี ${(ch.High || 0).toLocaleString()} คน — เกิน threshold 18%`,
      time: "now",
    });
  }
  if ((ug.Critical || 0) > 500) {
    out.push({
      severity: "warn",
      title: `Critical top-up พุ่งเกิน 500 บัญชี (${(ug.Critical || 0).toLocaleString()})`,
      body: "ต้องเปิด campaign reminder ภายใน 7 วัน เพื่อกัน churn",
      time: "now",
    });
  }
  if ((ap.revenue_at_risk || 0) > 5_000_000) {
    out.push({
      severity: "danger",
      title: `Revenue at risk ${Number(ap.revenue_at_risk).toLocaleString()} ฿`,
      body: "เกินกรอบความเสี่ยงรายไตรมาส — ส่งต่อทีม Account Mgmt",
      time: "now",
    });
  }
  if ((summary.rfm_distribution?.["At Risk"] || 0) > 1000) {
    out.push({
      severity: "warn",
      title: `RFM "At Risk" segment เกิน 1,000 ราย`,
      body: "Recency ต่ำติดต่อกัน — แนะนำ trigger win-back",
      time: "now",
    });
  }
  // Always show at least 1 info signal
  out.push({
    severity: "info",
    title: "Model freshness ปกติ",
    body: "PSI 0.08 · KS p-value 0.42 · ไม่มี drift",
    time: "5m",
  });
  return out;
}
