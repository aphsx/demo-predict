"use client";
export const dynamic = "force-dynamic";
import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, Zap, ArrowUpRight, ChevronRight, Orbit, Radar, Gem, UsersRound,
} from "lucide-react";
import {
  StatusPill,
  Skeleton, lifecycleTone,
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
                <StatusPill tone="brand">{runId ? `Run ${runId.slice(0, 8)}` : "No run selected"}</StatusPill>
                <StatusPill tone="neutral">{loading ? "Syncing live data" : "Live portfolio snapshot"}</StatusPill>
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

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]">
        <div className="overflow-hidden rounded-lg border border-[color:var(--line)] bg-white">
          <SectionTop
            eyebrow="Lifecycle"
            title="Lifecycle mix"
            hint="กระจายของลูกค้าใน 4 stage หลัก"
            actionHref="/customers"
          />
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <LifecycleFeatureTile
              color={LIFECYCLE_COLOR["Active Paid"]}
              label="Active Paid"
              count={activePaidCount}
              detail={`Avg churn ${formatPercent(ap.avg_churn)} · Avg CLV ${formatCurrency(ap.avg_clv)}`}
              href="/customers?lifecycle_stage=Active%20Paid"
            />
            <LifecycleFeatureTile
              color={LIFECYCLE_COLOR["Active Free"]}
              label="Active Free"
              count={activeFreeCount}
              detail={`Avg convert ${formatPercent(cv.avg_convert)}`}
              href="/customers?lifecycle_stage=Active%20Free"
            />
            <LifecycleFeatureTile
              color={LIFECYCLE_COLOR["Churned"]}
              label="Churned"
              count={churnedCount}
              detail={`Avg comeback ${formatPercent(wb.avg_comeback)}`}
              href="/customers?lifecycle_stage=Churned"
            />
            <LifecycleFeatureTile
              color={LIFECYCLE_COLOR["Ghost"]}
              label="Ghost"
              count={ghostCount}
              detail="ไม่เคยใช้งาน"
              href="/customers?lifecycle_stage=Ghost"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--line)] bg-white">
          <SectionTop
            eyebrow="Customers"
            title="Customer list"
            hint="ตัวอย่างลูกค้าจาก run ปัจจุบัน"
            actionHref="/customers"
          />
          <div className="p-3">
            <div className="space-y-3">
              {loading && [...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-[74px] rounded-[20px]" />
              ))}
              {!loading && previewCustomers.map((customer: any) => (
                <CustomerPreviewCard key={customer.acc_id} customer={customer} />
              ))}
              {!loading && previewCustomers.length === 0 && (
                <div className="rounded-[22px] border border-dashed border-[color:var(--line)] bg-[color:var(--surface-2)] px-4 py-8 text-center text-[13px] text-[color:var(--ink-5)]">
                  ยังไม่มีลูกค้า
                </div>
              )}
            </div>
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

function SectionTop({
  eyebrow, title, hint, actionHref,
}: {
  eyebrow: string;
  title: string;
  hint: string;
  actionHref: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4 px-4 pt-4 pb-2">
      <div>
        <div className="text-[11px] font-normal text-[color:var(--ink-5)]">
          {eyebrow}
        </div>
        <h3 className="mt-1 text-[18px] font-medium tracking-[-0.02em] text-[#08060d]">
          {title}
        </h3>
        <p className="mt-1 text-[11px] text-[color:var(--ink-4)]">{hint}</p>
      </div>
      <Link
        href={actionHref}
        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-normal text-[color:var(--ink-4)]"
      >
        View all <ChevronRight size={13} />
      </Link>
    </div>
  );
}

function LifecycleFeatureTile({
  color, label, count, detail, href,
}: { color: string; label: string; count: number; detail: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--surface-2)] p-4"
    >
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <span className="text-[12px] font-semibold text-[color:var(--ink-2)]">{label}</span>
        <ArrowUpRight size={12} className="ml-auto text-[color:var(--ink-5)]" />
      </div>
      <div className="num mt-3 text-[28px] font-bold leading-none tracking-[-0.03em] text-[color:var(--ink-2)]">
        {count.toLocaleString()}
      </div>
      <div className="mt-2 text-[11px] leading-5 text-[color:var(--ink-4)]">{detail}</div>
    </Link>
  );
}

function CustomerPreviewCard({
  customer,
}: {
  customer: any;
}) {
  return (
    <Link
      href={`/customers/${customer.acc_id}`}
      className="flex items-center gap-3 rounded-[20px] border border-[color:var(--line)] bg-[color:var(--surface-2)] px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="num text-[16px] font-semibold text-[color:var(--moby-700)]">
            {customer.acc_id}
          </span>
          <StatusPill tone={lifecycleTone(customer.lifecycle_stage)}>
            {customer.lifecycle_stage}
          </StatusPill>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[color:var(--ink-4)]">
          <span>Churn {customer.churn_probability != null ? `${(customer.churn_probability * 100).toFixed(1)}%` : "—"}</span>
          <span>CLV {customer.predicted_clv_6m != null ? `${Number(customer.predicted_clv_6m).toLocaleString()} ฿` : "—"}</span>
        </div>
      </div>
      <div className="inline-flex items-center gap-1 text-[12px] font-medium text-[color:var(--moby-700)]">
        Open <ChevronRight size={13} />
      </div>
    </Link>
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
