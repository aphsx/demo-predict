"use client";
export const dynamic = "force-dynamic";
import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, Zap, ArrowUpRight, ChevronRight, Orbit, Radar, Gem, UsersRound,
} from "lucide-react";
import {
  StatusPill,
  Skeleton,
  StackBar,
  lifecycleTone,
} from "@/components/ui";
import { fetchPredictions, fetchSummary } from "@/lib/api";
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
  const [previewCustomers, setPreviewCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetchSummary(runId),
      fetchPredictions(runId, { page: "1", page_size: "16" }),
    ])
      .then(([s, predictionPage]) => {
        setSummary(s);
        setPreviewCustomers(pickCustomerPreview(predictionPage.data, 6));
        setLoading(false);
      })
      .catch((e) => {
        setSummary(null);
        setPreviewCustomers([]);
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
  const activeFreeCount = lc["Active Free"]?.total || 0;
  const churnedCount = lc["Churned"]?.total || 0;
  const ghostCount = lc["Ghost"]?.total || 0;

  return (
    <div className="px-8 py-6 pb-12 space-y-6">
      <section
        className="relative overflow-hidden rounded-[30px] border border-white/20 px-6 py-6 text-white sm:px-7 lg:px-8"
        style={{
          backgroundImage: [
            "radial-gradient(rgba(7, 29, 126, 0.52) 0%, transparent 42%)",
            "url(/assets/intro/about_bg.webp)",
            "linear-gradient(180deg, rgba(0,0,0,0.24) 0%, rgba(0,0,0,0.04) 38%, rgba(0,0,0,0.16) 100%)",
            "linear-gradient(140deg, #1d1f2a -10%, #006bff 57%, #1893f0 72%, #ffa400 87%, #fc4c02 97%)",
          ].join(", "),
          backgroundRepeat: "no-repeat, no-repeat, no-repeat, no-repeat",
          backgroundSize: "140% 150%, cover, 100% 100%, 100% 100%",
          backgroundPosition: "center, center, center, center",
        }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.10),transparent_45%)]" />
        <div className="relative">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="info">Dashboard</StatusPill>
              </div>

              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/68">
                  Portfolio intelligence
                </p>
                <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-[42px]">
                  Dashboard
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/78 sm:text-[15px]">
                  มองภาพรวมลูกค้าทั้งพอร์ตในหน้าเดียว ทั้ง churn risk, conversion, win-back
                  และสัญญาณที่ควรลงมือก่อน เพื่อให้ทีมตัดสินใจได้เร็วขึ้น
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 xl:justify-end">
              <Link
                href="/customers"
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/20 bg-white/96 px-4 text-[13px] font-semibold text-slate-900"
              >
                <Users size={15} />
                Browse customers
              </Link>
              <Link
                href="/playbooks"
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/22 bg-white/12 px-4 text-[13px] font-semibold text-white"
              >
                <Zap size={15} />
                Open action queue
              </Link>
            </div>
          </div>
        </div>
      </section>

      {loadError && (
        <div className="rounded-2xl border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
          {loadError}
        </div>
      )}

      {!loading && !loadError && totalCustomers > 0 && activePaidCount === 0 && (
        <div className="rounded-2xl border border-[color:var(--line)] bg-[linear-gradient(180deg,#ffffff,rgba(250,251,253,0.96))] px-4 py-3 text-[13px] text-[color:var(--ink-3)]">
          ชุดข้อมูลนี้ไม่มีลูกค้า Active Paid — ดูได้ที่ Active Free, Churned หรือ Ghost ใน Customers
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-[124px]" />)
        ) : (
          <>
            <SummaryStatCard
              icon={<UsersRound size={16} />}
              tone="slate"
              label="Total customers"
              value={totalCustomers.toLocaleString()}
              hint="Portfolio coverage"
            />
            <SummaryStatCard
              icon={<Orbit size={16} />}
              tone="blue"
              label="Active paid base"
              value={activePaidCount.toLocaleString()}
              hint="Core revenue cohort"
            />
            <SummaryStatCard
              icon={<Radar size={16} />}
              tone="rose"
              label="Avg churn probability"
              value={formatPercent(ap.avg_churn)}
              hint="Active Paid cohort"
            />
            <SummaryStatCard
              icon={<Gem size={16} />}
              tone="amber"
              label="Avg CLV (6m)"
              value={formatCurrency(ap.avg_clv)}
              hint="Revenue forecast"
            />
          </>
        )}
      </div>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="surface-elev overflow-hidden">
          <PanelHeader
            eyebrow="Lifecycle"
            title="Lifecycle mix"
            hint="สัดส่วนลูกค้าใน 4 stage หลักของพอร์ต"
            actionHref="/customers"
          />
          <div className="border-t border-[color:var(--line-2)] px-5 py-5">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-2.5 w-full rounded-full" />
                <div className="space-y-2.5">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-[68px] rounded-[var(--r-md)]" />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <StackBar
                  data={{
                    "Active Paid": activePaidCount,
                    "Active Free": activeFreeCount,
                    Churned: churnedCount,
                    Ghost: ghostCount,
                  }}
                  palette={LIFECYCLE_COLOR}
                  height={10}
                />
                <div className="mt-5 space-y-2">
                  <LifecycleStageRow
                    color={LIFECYCLE_COLOR["Active Paid"]}
                    label="Active Paid"
                    count={activePaidCount}
                    total={totalCustomers}
                    detail={`Avg churn ${formatPercent(ap.avg_churn)} · CLV ${formatCurrency(ap.avg_clv)}`}
                    href="/customers?lifecycle_stage=Active%20Paid"
                  />
                  <LifecycleStageRow
                    color={LIFECYCLE_COLOR["Active Free"]}
                    label="Active Free"
                    count={activeFreeCount}
                    total={totalCustomers}
                    detail={`Avg convert ${formatPercent(cv.avg_convert)}`}
                    href="/customers?lifecycle_stage=Active%20Free"
                  />
                  <LifecycleStageRow
                    color={LIFECYCLE_COLOR["Churned"]}
                    label="Churned"
                    count={churnedCount}
                    total={totalCustomers}
                    detail={`Avg comeback ${formatPercent(wb.avg_comeback)}`}
                    href="/customers?lifecycle_stage=Churned"
                  />
                  <LifecycleStageRow
                    color={LIFECYCLE_COLOR["Ghost"]}
                    label="Ghost"
                    count={ghostCount}
                    total={totalCustomers}
                    detail="สมัครแล้วแต่ไม่เคยใช้งาน"
                    href="/customers?lifecycle_stage=Ghost"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="surface-elev overflow-hidden">
          <PanelHeader
            eyebrow="Customers"
            title="Customer list"
            hint="ตัวอย่างจาก run ปัจจุบัน — คลิกแถวเพื่อดูรายละเอียด"
            actionHref="/customers"
          />
          <div className="border-t border-[color:var(--line-2)]">
            {loading ? (
              <div className="space-y-0 p-1">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="border-b border-[color:var(--line-2)] px-4 py-3 last:border-0">
                    <Skeleton className="mb-2 h-4 w-28" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                ))}
              </div>
            ) : previewCustomers.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-[13px] font-medium text-[color:var(--ink-2)]">ยังไม่มีลูกค้า</p>
                <p className="mt-1 text-[12px] text-[color:var(--ink-5)]">อัปโหลดข้อมูลและรัน analysis ก่อน</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Stage</th>
                      <th>Churn</th>
                      <th className="hidden sm:table-cell">CLV (6m)</th>
                      <th aria-label="Open" />
                    </tr>
                  </thead>
                  <tbody>
                    {previewCustomers.map((customer: Record<string, unknown>) => (
                      <CustomerPreviewRow key={String(customer.acc_id)} customer={customer} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────── */

function SummaryStatCard({
  icon, tone, label, value, hint,
}: {
  icon: ReactNode;
  tone: "slate" | "blue" | "rose" | "amber";
  label: string;
  value: string;
  hint: string;
}) {
  const tones = {
    slate: {
      bg: "#ffffff",
      fg: "#475569",
    },
    blue: {
      bg: "#ffffff",
      fg: "#2563eb",
    },
    rose: {
      bg: "#ffffff",
      fg: "#e11d48",
    },
    amber: {
      bg: "#ffffff",
      fg: "#d97706",
    },
  } as const;

  const current = tones[tone];

  return (
    <div
      className="relative flex h-[140px] flex-col justify-between overflow-hidden rounded-lg border border-[color:var(--line)] bg-white p-4 text-left"
      style={{ background: current.bg }}
    >
      <div className="space-y-1">
        <div className="flex w-full items-start justify-between gap-3 text-left">
          <div className="text-[11px] font-normal leading-tight text-[color:var(--ink-4)]">
            {label}
          </div>
          <div
            className="grid h-5 w-5 place-items-center shrink-0"
            style={{ color: current.fg }}
          >
            {icon}
          </div>
        </div>
        <div>
          <div className="num text-[24px] font-bold leading-none tracking-[-0.03em] text-[color:var(--ink-2)]">
            {value}
          </div>
        </div>
      </div>
      <div className="text-[11px] font-normal text-left" style={{ color: current.fg }}>{hint}</div>
    </div>
  );
}

function PanelHeader({
  eyebrow, title, hint, actionHref,
}: {
  eyebrow: string;
  title: string;
  hint: string;
  actionHref: string;
}) {
  return (
    <header className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
          {eyebrow}
        </p>
        <h3 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-[color:var(--ink-1)]">
          {title}
        </h3>
        <p className="mt-1 text-[12px] leading-5 text-[color:var(--ink-4)]">{hint}</p>
      </div>
      <Link
        href={actionHref}
        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[color:var(--line)] bg-white px-3 text-[12px] font-medium text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--surface-2)]"
      >
        View all <ChevronRight size={13} className="text-[color:var(--ink-5)]" />
      </Link>
    </header>
  );
}

function LifecycleStageRow({
  color, label, count, total, detail, href,
}: {
  color: string;
  label: string;
  count: number;
  total: number;
  detail: string;
  href: string;
}) {
  const share = total > 0 ? (count / total) * 100 : 0;

  return (
    <Link
      href={href}
      className="group lift block rounded-[var(--r-md)] border border-[color:var(--line-2)] bg-[color:var(--surface-2)] px-4 py-3.5 hover:border-[color:var(--line)] hover:bg-white"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1 h-9 w-1 shrink-0 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-semibold text-[color:var(--ink-1)]">{label}</span>
            <span className="num text-[12px] text-[color:var(--ink-5)]">
              {share.toFixed(1)}% of portfolio
            </span>
            <ArrowUpRight
              size={13}
              className="ml-auto text-[color:var(--ink-5)] opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num text-[22px] font-bold leading-none tracking-[-0.03em] text-[color:var(--ink-1)]">
              {count.toLocaleString()}
            </span>
            <span className="text-[11.5px] leading-5 text-[color:var(--ink-4)]">{detail}</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${share}%`, background: color }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

function CustomerPreviewRow({
  customer,
}: {
  customer: Record<string, unknown>;
}) {
  const accId = String(customer.acc_id ?? "");
  const stage = String(customer.lifecycle_stage ?? "");
  const churn =
    customer.churn_probability != null
      ? `${(Number(customer.churn_probability) * 100).toFixed(1)}%`
      : "—";
  const clv =
    customer.predicted_clv_6m != null
      ? `${Number(customer.predicted_clv_6m).toLocaleString()} ฿`
      : "—";
  const churnPct = customer.churn_probability != null ? Number(customer.churn_probability) * 100 : null;

  return (
    <tr className="group cursor-pointer">
      <td>
        <Link
          href={`/customers/${accId}`}
          className="num font-semibold text-[color:var(--moby-700)] group-hover:text-[color:var(--moby-800)]"
        >
          {accId}
        </Link>
      </td>
      <td>
        <StatusPill tone={lifecycleTone(stage)} dot={false}>
          {stage}
        </StatusPill>
      </td>
      <td>
        <div className="flex items-center gap-2">
          <span className="num text-[13px] text-[color:var(--ink-2)]">{churn}</span>
          {churnPct != null && (
            <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-[color:var(--surface-2)] md:inline-block">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.min(100, churnPct)}%`,
                  background:
                    churnPct >= 70 ? "var(--danger)"
                    : churnPct >= 40 ? "var(--warn)"
                    : "var(--ok)",
                }}
              />
            </span>
          )}
        </div>
      </td>
      <td className="num hidden sm:table-cell text-[color:var(--ink-3)]">{clv}</td>
      <td className="text-right">
        <Link
          href={`/customers/${accId}`}
          className="inline-flex items-center gap-0.5 text-[12px] font-medium text-[color:var(--ink-5)] opacity-0 transition-opacity group-hover:text-[color:var(--moby-700)] group-hover:opacity-100"
        >
          Open <ChevronRight size={13} />
        </Link>
      </td>
    </tr>
  );
}

function formatPercent(value: unknown) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatCurrency(value: unknown) {
  return `${Number(value || 0).toLocaleString()} ฿`;
}

function pickCustomerPreview(rows: Record<string, unknown>[], limit: number) {
  const copy = [...rows];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, limit);
}
