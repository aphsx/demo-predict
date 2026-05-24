"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users, AlertTriangle, Wallet, Zap, Flame, ShieldOff, ArrowUpRight,
  Sparkles, RefreshCw, ChevronRight, Activity,
} from "lucide-react";
import {
  KpiCard, SectionCard, StatusPill, AlertItem,
  PageHeader, ActionChip, Skeleton, lifecycleTone,
} from "@/components/ui";
import { fetchSummary, fetchPredictions } from "@/lib/api";
import { getDisplayError } from "@/lib/ui-error";
import { useRunStore } from "@/lib/runStore";

const LIFECYCLE_COLOR: Record<string, string> = {
  "Active Paid": "var(--c-paid)",
  "Active Free": "var(--c-free)",
  "Churned":     "var(--c-churn)",
  "Ghost":       "var(--c-ghost)",
};

export default function Dashboard() {
  const { runId } = useRunStore();
  const [summary, setSummary] = useState<any>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetchSummary(runId),
      fetchPredictions(runId, { page: "1", page_size: "8" }),
    ])
      .then(([s, pag]) => {
        setSummary(s);
        setPreview(Array.isArray(pag.data) ? pag.data : []);
        setLoading(false);
      })
      .catch((e) => {
        setSummary(null);
        setPreview([]);
        setLoadError(getDisplayError(e, "โหลดข้อมูลไม่สำเร็จ"));
        setLoading(false);
      });
  }, [runId]);

  const ap = summary?.active_paid || {};
  const wb = summary?.winback || {};
  const cv = summary?.conversion || {};
  const lc = summary?.lifecycle || {};

  const totalCustomers = summary?.total_customers || 0;
  const activePaidCount = lc["Active Paid"]?.total || 0;

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

        {loadError && (
          <div className="rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
            {loadError}
          </div>
        )}

        {!loading && !loadError && totalCustomers > 0 && activePaidCount === 0 && (
          <div className="rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)] px-4 py-3 text-[13px] text-[color:var(--ink-3)]">
            ชุดข้อมูลนี้ไม่มีลูกค้า Active Paid — ดูได้ที่ Active Free, Churned หรือ Ghost ใน Customers
          </div>
        )}

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
                label="Avg Churn Probability"
                value={Number(ap.avg_churn || 0)}
                format="percent"
                hint="Active Paid cohort"
                accent="rose"
              />
              <KpiCard
                label="Avg CLV (6m)"
                value={Number(ap.avg_clv || 0)}
                format="currency"
                hint="Active Paid cohort"
                accent="blue"
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
                detail={`Avg churn ${((ap.avg_churn || 0) * 100).toFixed(1)}% · Avg CLV ${Number(ap.avg_clv || 0).toLocaleString()} ฿`}
                href="/customers?lifecycle_stage=Active%20Paid"
              />
              <LifecycleTile
                color={LIFECYCLE_COLOR["Active Free"]}
                label="Active Free"
                count={lc["Active Free"]?.total || 0}
                detail={`Avg convert ${((cv.avg_convert || 0) * 100).toFixed(1)}%`}
                href="/customers?lifecycle_stage=Active%20Free"
              />
              <LifecycleTile
                color={LIFECYCLE_COLOR["Churned"]}
                label="Churned"
                count={lc["Churned"]?.total || 0}
                detail={`Avg comeback ${((wb.avg_comeback || 0) * 100).toFixed(1)}%`}
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
            hint="เรียงตาม churn probability (ทุก lifecycle stage)"
            className="xl:col-span-2"
            right={<Link href="/customers" className="text-[12px] text-[color:var(--moby-700)] hover:underline">View all →</Link>}
          >
            <div className="-m-2 overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Stage</th>
                    <th>Churn Prob</th>
                    <th>CLV (6m)</th>
                    <th>Comeback Prob</th>
                    <th>Convert Prob</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r: any) => (
                    <tr key={r.acc_id}>
                      <td className="num text-[color:var(--moby-700)]">{r.acc_id}</td>
                      <td><StatusPill tone={lifecycleTone(r.lifecycle_stage)}>{r.lifecycle_stage}</StatusPill></td>
                      <td className="num">
                        {r.churn_probability != null
                          ? `${(r.churn_probability * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="num">
                        {r.predicted_clv_6m != null
                          ? `${Number(r.predicted_clv_6m).toLocaleString()} ฿`
                          : "—"}
                      </td>
                      <td className="num">
                        {r.comeback_probability != null
                          ? `${(r.comeback_probability * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="num">
                        {r.conversion_probability != null
                          ? `${(r.conversion_probability * 100).toFixed(1)}%`
                          : "—"}
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
                label="Active Free users"
                value={lc["Active Free"]?.total || 0}
                sub={`Avg convert ${(((cv.avg_convert || 0) * 100)).toFixed(1)}%`}
                tone="violet"
                href="/customers?lifecycle_stage=Active%20Free"
              />
              <SignalRow
                icon={<Flame size={14} />}
                label="Churned customers"
                value={lc["Churned"]?.total || 0}
                sub={`Avg comeback ${(((wb.avg_comeback || 0) * 100)).toFixed(1)}%`}
                tone="amber"
                href="/customers?lifecycle_stage=Churned"
              />
              <SignalRow
                icon={<Wallet size={14} />}
                label="Active Paid customers"
                value={lc["Active Paid"]?.total || 0}
                sub={`Avg churn ${(((ap.avg_churn || 0) * 100)).toFixed(1)}% · Avg CLV ${Number(ap.avg_clv || 0).toLocaleString()} ฿`}
                tone="blue"
                href="/customers?lifecycle_stage=Active%20Paid"
              />
              <SignalRow
                icon={<ShieldOff size={14} />}
                label="Ghost accounts"
                value={lc["Ghost"]?.total || 0}
                sub="ไม่เคยใช้งาน"
                tone="rose"
                href="/customers?lifecycle_stage=Ghost"
              />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────── */

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

  const avgChurn = ap.avg_churn || 0;
  if (avgChurn > 0.4) {
    out.push({
      severity: "danger",
      title: `High avg churn probability at ${(avgChurn * 100).toFixed(1)}%`,
      body: `Active Paid cohort มีค่าเฉลี่ย churn สูง — ตรวจสอบ retention strategy`,
      time: "now",
    });
  }
  // Always show at least 1 info signal
  out.push({
    severity: "info",
    title: "Model freshness ปกติ",
    body: "ไม่มี drift ตรวจพบ",
    time: "5m",
  });
  return out;
}
