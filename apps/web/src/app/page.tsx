"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, Zap, ArrowUpRight, Activity,
} from "lucide-react";
import {
  KpiCard, SectionCard, StatusPill,
  Skeleton, lifecycleTone,
} from "@/components/ui";
import { fetchSummary } from "@/lib/api";
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    fetchSummary(runId)
      .then((s) => {
        setSummary(s);
        setLoading(false);
      })
      .catch((e) => {
        setSummary(null);
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
        className="relative overflow-hidden rounded-[30px] border border-white/20 px-6 py-6 text-white shadow-[0_28px_80px_rgba(10,18,38,0.22)] sm:px-7 lg:px-8"
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
        <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_360px]">
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

            <div className="flex flex-wrap gap-3">
              <Link
                href="/customers"
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/20 bg-white/96 px-4 text-[13px] font-semibold text-slate-900 transition hover:bg-white"
              >
                <Users size={15} />
                Browse customers
              </Link>
              <Link
                href="/playbooks"
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/22 bg-white/12 px-4 text-[13px] font-semibold text-white transition hover:bg-white/18"
              >
                <Zap size={15} />
                Open action queue
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <HeroMetric
                label="Active Paid"
                value={activePaidCount}
                detail={`Avg churn ${formatPercent(ap.avg_churn)}`}
              />
              <HeroMetric
                label="Active Free"
                value={activeFreeCount}
                detail={`Avg convert ${formatPercent(cv.avg_convert)}`}
              />
              <HeroMetric
                label="Churned"
                value={churnedCount}
                detail={`Avg comeback ${formatPercent(wb.avg_comeback)}`}
              />
            </div>
          </div>

          <div className="rounded-[26px] border border-white/18 bg-[rgba(255,255,255,0.14)] p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/62">
                  Snapshot
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">Today&apos;s focus</h2>
              </div>
              <Activity size={18} className="text-white/72" />
            </div>

            <div className="mt-5 space-y-3">
              <QuickSignal
                label="Total customers"
                value={totalCustomers}
                detail="ในรอบประเมินล่าสุด"
              />
              <QuickSignal
                label="Ghost accounts"
                value={ghostCount}
                detail="บัญชีที่ยังไม่เคยใช้งาน"
              />
              <QuickSignal
                label="Conversion opportunities"
                value={activeFreeCount}
                detail={activeFreeCount > 0 ? "ฐานที่พร้อมผลักไป paid" : "ยังไม่พบกลุ่ม conversion เด่น"}
              />
            </div>

            <div className="mt-5 rounded-2xl border border-white/12 bg-black/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/62">
                  Priority pulse
                </span>
                <ArrowUpRight size={13} className="text-white/62" />
              </div>
              <p className="mt-2 text-[13px] leading-6 text-white/80">
                {activePaidCount > 0
                  ? `${activePaidCount.toLocaleString()} Active Paid accounts กำลังเป็น core revenue base ของรอบนี้`
                  : "ยังไม่มี Active Paid ใน run นี้ ให้โฟกัสที่ conversion และ win-back แทน"}
              </p>
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
        <div className="rounded-2xl border border-[color:var(--line)] bg-[linear-gradient(180deg,#ffffff,rgba(250,251,253,0.96))] px-4 py-3 text-[13px] text-[color:var(--ink-3)] shadow-[var(--shadow-1)]">
          ชุดข้อมูลนี้ไม่มีลูกค้า Active Paid — ดูได้ที่ Active Free, Churned หรือ Ghost ใน Customers
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-[124px]" />)
        ) : (
          <>
            <KpiCard
              label="Total customers"
              value={totalCustomers}
              hint="Portfolio coverage"
              accent="slate"
            />
            <KpiCard
              label="Active paid base"
              value={activePaidCount}
              hint="Core revenue cohort"
              accent="blue"
            />
            <KpiCard
              label="Avg churn probability"
              value={Number(ap.avg_churn || 0) * 100}
              format="percent"
              hint="Active Paid cohort"
              accent="rose"
            />
            <KpiCard
              label="Avg CLV (6m)"
              value={Number(ap.avg_clv || 0)}
              format="currency"
              hint="Revenue forecast"
              accent="amber"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <SectionCard
          title="Lifecycle mix"
          hint="กระจายของลูกค้าใน 4 stage หลัก"
          className="xl:col-span-2"
          right={
            <Link href="/customers" className="text-[12px] text-[color:var(--moby-700)] hover:underline">
              View all →
            </Link>
          }
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <LifecycleTile
              color={LIFECYCLE_COLOR["Active Paid"]}
              label="Active Paid"
              count={activePaidCount}
              detail={`Avg churn ${formatPercent(ap.avg_churn)} · Avg CLV ${formatCurrency(ap.avg_clv)}`}
              href="/customers?lifecycle_stage=Active%20Paid"
            />
            <LifecycleTile
              color={LIFECYCLE_COLOR["Active Free"]}
              label="Active Free"
              count={activeFreeCount}
              detail={`Avg convert ${formatPercent(cv.avg_convert)}`}
              href="/customers?lifecycle_stage=Active%20Free"
            />
            <LifecycleTile
              color={LIFECYCLE_COLOR["Churned"]}
              label="Churned"
              count={churnedCount}
              detail={`Avg comeback ${formatPercent(wb.avg_comeback)}`}
              href="/customers?lifecycle_stage=Churned"
            />
            <LifecycleTile
              color={LIFECYCLE_COLOR["Ghost"]}
              label="Ghost"
              count={ghostCount}
              detail="ไม่เคยใช้งาน"
              href="/customers?lifecycle_stage=Ghost"
            />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────── */

function HeroMetric({
  label, value, detail,
}: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/14 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">{value.toLocaleString()}</div>
      <div className="mt-1 text-[11px] text-white/68">{detail}</div>
    </div>
  );
}

function QuickSignal({
  label, value, detail,
}: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-white/72">{label}</span>
        <span className="text-xl font-semibold text-white">{value.toLocaleString()}</span>
      </div>
      <div className="mt-1 text-[11px] text-white/56">{detail}</div>
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

function formatPercent(value: unknown) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatCurrency(value: unknown) {
  return `${Number(value || 0).toLocaleString()} ฿`;
}
