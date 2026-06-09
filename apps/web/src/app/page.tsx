"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { type ElementType, useEffect, useRef } from "react";
import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  Gem,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { StatusPill } from "@/components/ui";

type MonthlyRevenuePoint = {
  month: string;
  revenue: number;
  payments: number;
};

type DashboardOverview = {
  run: {
    name: string;
    cutoff_date: string;
    output_status: "mock" | "ready" | "processing";
  };
  totals: {
    customers: number;
    active_customers: number;
    paid_customers: number;
    ghost_customers: number;
    revenue_at_risk: number;
    followups_due_7d: number;
  };
  lifecycle: Record<"Active Paid" | "Active Free" | "Churned" | "Ghost", number>;
  active_churn: {
    base_customers: number;
    high: number;
    medium: number;
    low: number;
  };
  value: {
    high_value: number;
    mid_value: number;
    low_value: number;
    high_value_at_risk: number;
    predicted_clv_6m: number;
  };
  monthly_value: {
    avg_monthly_revenue: number;
    last_month_revenue: number;
    months: number;
  };
  credit: {
    critical: number;
    warning: number;
    monitor: number;
    stable: number;
    next_topup_7d: number;
    predicted_usage_30d: number;
  };
};

const MONTHLY_REVENUE: MonthlyRevenuePoint[] = [
  { month: "2025-07", revenue: 742000, payments: 58 },
  { month: "2025-08", revenue: 786000, payments: 63 },
  { month: "2025-09", revenue: 821000, payments: 66 },
  { month: "2025-10", revenue: 805000, payments: 61 },
  { month: "2025-11", revenue: 864000, payments: 70 },
  { month: "2025-12", revenue: 912000, payments: 74 },
  { month: "2026-01", revenue: 895000, payments: 72 },
  { month: "2026-02", revenue: 936000, payments: 76 },
  { month: "2026-03", revenue: 971000, payments: 81 },
  { month: "2026-04", revenue: 1008000, payments: 83 },
  { month: "2026-05", revenue: 1181000, payments: 90 },
  { month: "2026-06", revenue: 1048000, payments: 84 },
];

const MOCK_OVERVIEW: DashboardOverview = {
  run: {
    name: "June 2026 prediction run",
    cutoff_date: "2026-06-01",
    output_status: "mock",
  },
  totals: {
    customers: 1284,
    active_customers: 846,
    paid_customers: 512,
    ghost_customers: 187,
    revenue_at_risk: 1286000,
    followups_due_7d: 74,
  },
  lifecycle: {
    "Active Paid": 512,
    "Active Free": 334,
    Churned: 251,
    Ghost: 187,
  },
  active_churn: {
    base_customers: 846,
    high: 96,
    medium: 214,
    low: 536,
  },
  value: {
    high_value: 118,
    mid_value: 392,
    low_value: 337,
    high_value_at_risk: 41,
    predicted_clv_6m: 5420000,
  },
  monthly_value: {
    avg_monthly_revenue: 914000,
    last_month_revenue: 1048000,
    months: 12,
  },
  credit: {
    critical: 28,
    warning: 66,
    monitor: 143,
    stable: 609,
    next_topup_7d: 52,
    predicted_usage_30d: 1840000,
  },
};

const LIFECYCLE_PALETTE = {
  "Active Paid": "var(--c-paid)",
  "Active Free": "var(--c-free)",
  Churned: "var(--c-churn)",
  Ghost: "var(--c-ghost)",
};

const CHURN_PALETTE = {
  High: "var(--danger)",
  Medium: "var(--warn)",
  Low: "var(--ok)",
};

const CREDIT_PALETTE = {
  Critical: "var(--danger)",
  Warning: "var(--warn)",
  Monitor: "var(--info)",
  Stable: "var(--ok)",
};

export default function Dashboard() {
  const overview = MOCK_OVERVIEW;
  const activeHighRiskPct = (overview.active_churn.high / overview.active_churn.base_customers) * 100;
  const ghostPct = (overview.totals.ghost_customers / overview.totals.customers) * 100;

  return (
    <main className="px-8 py-6 pb-12 space-y-6">
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
                <StatusPill tone="info">Prediction overview</StatusPill>
                <StatusPill tone="neutral" dot={false}>Mock data</StatusPill>
              </div>

              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/68">
                  ML v2 output summary
                </p>
                <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-[42px]">
                  Dashboard
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/78 sm:text-[15px]">
                  ภาพรวมผล prediction ที่ควรเห็นก่อนเริ่มทำงาน: portfolio ทั้งหมด,
                  high-value risk, active churn risk, value at risk, credit urgency และรายได้รายเดือนล่าสุด
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:items-end">
              <div className="rounded-2xl border border-white/16 bg-white/12 px-4 py-3 text-right backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-white/60">
                  Cutoff
                </div>
                <div className="num mt-1 text-[18px] font-semibold">{overview.run.cutoff_date}</div>
                <div className="mt-1 text-[11px] text-white/62">{overview.run.name}</div>
              </div>
              <div className="flex flex-wrap gap-3 xl:justify-end">
                <Link
                  href="/customers"
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/20 bg-white/96 px-4 text-[13px] font-semibold text-slate-900"
                >
                  Customers <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Gem}
          label="Avg monthly value"
          value={formatCurrency(overview.monthly_value.avg_monthly_revenue)}
          hint={`${overview.monthly_value.months}-month avg from payment history`}
          tone="warn"
          href="/monthly-value"
        />
        <MetricCard
          icon={TrendingDown}
          label="Active high risk"
          value={formatNumber(overview.active_churn.high)}
          hint={`${activeHighRiskPct.toFixed(1)}% of active customers`}
          tone="danger"
        />
        <MetricCard
          icon={CreditCard}
          label="Revenue at risk"
          value={formatCurrency(overview.totals.revenue_at_risk)}
          hint="estimated loss if high-risk customers churn"
          tone="warn"
        />
        <MetricCard
          icon={CalendarClock}
          label="30d credit demand"
          value={formatCredits(overview.credit.predicted_usage_30d)}
          hint="forecast from SMS/Email usage history"
          tone="brand"
        />
      </section>

      <section className="space-y-5">
        <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
          <LifecycleMixCard overview={overview} />
          <MonthlyRevenueCard data={MONTHLY_REVENUE} />
        </div>
        <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-3">
          <RiskCard overview={overview} />
          <ValueCard overview={overview} />
          <CreditUrgencyCard overview={overview} />
        </div>
      </section>

      <section className="surface p-4">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[color:var(--ink-5)]">
          <ShieldCheck size={12} />
          Mock dashboard data is isolated in `MOCK_OVERVIEW`
          <span className="opacity-50">·</span>
          API-ready shape: totals / lifecycle / active_churn / value / credit / monthly_revenue
          <span className="opacity-50">·</span>
          Ghost share: {ghostPct.toFixed(1)}%
        </div>
      </section>
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "brand",
  href,
}: {
  icon: ElementType;
  label: string;
  value: string;
  hint: string;
  tone?: "brand" | "danger" | "warn";
  href?: string;
}) {
  const toneClass = tone === "danger"
    ? "text-[color:var(--danger)] bg-[color:var(--danger-bg)]"
    : tone === "warn"
      ? "text-[color:var(--warn)] bg-[color:var(--warn-bg)]"
      : "text-[color:var(--moby-600)] bg-[color:var(--moby-50)]";

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-5)]">
            {label}
          </div>
          <div className="num mt-2 text-[30px] font-semibold tracking-[-0.035em] text-[color:var(--ink-1)]">
            {value}
          </div>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-2xl ${toneClass}`}>
          <Icon size={17} />
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[11.5px] text-[color:var(--ink-5)]">
        <span>{hint}</span>
        {href ? <ArrowRight size={12} className="shrink-0 text-[color:var(--ink-4)]" /> : null}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="surface lift block p-5 transition hover:-translate-y-0.5">
        {content}
      </Link>
    );
  }

  return (
    <div className="surface p-5">
      {content}
    </div>
  );
}

function LifecycleMixCard({ overview }: { overview: DashboardOverview }) {
  const lifecycleEntries = Object.entries(overview.lifecycle) as Array<[
    keyof typeof LIFECYCLE_PALETTE,
    number,
  ]>;

  return (
    <div className="surface-elev flex h-full flex-col overflow-hidden p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[color:var(--ink-1)]">
            Customer lifecycle mix
          </h2>
        </div>
        <span className="rounded-full bg-[color:var(--moby-50)] px-3 py-1 text-[11px] font-semibold text-[color:var(--moby-700)]">
          4 segments
        </span>
      </div>

      <div
        className="mt-5 flex h-3 overflow-hidden rounded-full bg-[color:var(--surface-2)]"
        aria-label="Lifecycle distribution"
      >
        {lifecycleEntries.map(([stage, count]) => {
          const pct = overview.totals.customers > 0 ? (count / overview.totals.customers) * 100 : 0;
          return (
            <span
              key={stage}
              className="h-full"
              style={{
                width: `${pct}%`,
                background: LIFECYCLE_PALETTE[stage],
              }}
            />
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        {lifecycleEntries.map(([stage, count]) => (
          <LifecycleFact
            key={stage}
            label={stage}
            value={count}
            total={overview.totals.customers}
            color={LIFECYCLE_PALETTE[stage]}
          />
        ))}
      </div>
    </div>
  );
}

function LifecycleFact({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-5)]">
              {label}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="num text-[20px] font-semibold leading-none text-[color:var(--ink-1)]">
            {formatNumber(value)}
          </div>
          <div className="num mt-1 text-[11px] text-[color:var(--ink-5)]">{pct.toFixed(1)}%</div>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-2)]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function RiskCard({ overview }: { overview: DashboardOverview }) {
  const churnData = [
    ["High", overview.active_churn.high],
    ["Medium", overview.active_churn.medium],
    ["Low", overview.active_churn.low],
  ] as const;
  const highPct = (overview.active_churn.high / overview.active_churn.base_customers) * 100;

  return (
    <div className="surface-elev flex h-full flex-col overflow-hidden">
      <PanelHeader
        eyebrow="Churn"
        title="Active customer risk"
        hint="ไม่นับ churned และ ghost เพื่อไม่ให้ตัวเลข churn active ปน lifecycle อื่น"
        icon={TrendingDown}
      />
      <div className="flex-1 border-t border-[color:var(--line-2)] p-5">
        <div className="mb-4 rounded-[24px] border border-[color:var(--danger-bg)] bg-[color:var(--danger-bg)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--danger)]">
            High-risk active
          </div>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div className="num text-[34px] font-semibold tracking-[-0.04em] text-[color:var(--danger)]">
              {formatNumber(overview.active_churn.high)}
            </div>
            <div className="num pb-1 text-right text-[12px] text-[color:var(--ink-4)]">
              {highPct.toFixed(1)}% of active customers
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {churnData.map(([label, value]) => (
            <div key={label} className="rounded-[24px] border border-[color:var(--line)] bg-white p-4">
              <RiskListRow
                label={label}
                value={value}
                total={overview.active_churn.base_customers}
                totalLabel="active"
                color={CHURN_PALETTE[label as keyof typeof CHURN_PALETTE]}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RiskListRow({
  label,
  value,
  total,
  totalLabel,
  hint,
  color,
}: {
  label: string;
  value: number;
  total?: number;
  totalLabel?: string;
  hint?: string;
  color: string;
}) {
  const pct = total && total > 0 ? (value / total) * 100 : null;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-2)]">
            {label}
          </div>
          <div className="num mt-1 text-[11px] text-[color:var(--ink-5)]">
            {pct !== null ? `${pct.toFixed(1)}% of ${totalLabel ?? "total"}` : hint}
          </div>
        </div>
      </div>
      <div className="num text-[22px] font-semibold text-[color:var(--ink-1)]">
        {formatNumber(value)}
      </div>
    </div>
  );
}

function ValueCard({ overview }: { overview: DashboardOverview }) {
  const valueData = [
    ["High value at risk", overview.value.high_value_at_risk, "High CLV + high churn risk", "var(--danger)"],
    ["High value", overview.value.high_value, "accounts", "var(--moby-600)"],
    ["Mid value", overview.value.mid_value, "accounts", "var(--info)"],
    ["Low value", overview.value.low_value, "accounts", "var(--ink-5)"],
  ] as const;

  return (
    <div className="surface-elev flex h-full flex-col overflow-hidden">
      <PanelHeader
        eyebrow="Value"
        title="CLV concentration"
        hint="ใช้ดูว่าความเสี่ยงกระทบลูกค้ากลุ่มมูลค่าสูงแค่ไหน"
        icon={Gem}
      />
      <div className="flex-1 border-t border-[color:var(--line-2)] p-5">
        <div className="mb-4 rounded-[24px] border border-[color:var(--moby-100)] bg-[color:var(--moby-50)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--moby-700)]">Predicted CLV</div>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div className="num text-[28px] font-semibold tracking-[-0.04em] text-[color:var(--ink-1)]">
              {formatCurrency(overview.value.predicted_clv_6m)}
            </div>
            <div className="pb-1 text-right text-[12px] text-[color:var(--ink-4)]">6-month forecast</div>
          </div>
        </div>
        <div className="space-y-3">
          {valueData.map(([label, value, hint, color]) => (
            <div key={label} className="rounded-[24px] border border-[color:var(--line)] bg-white p-4">
              <RiskListRow
                label={label}
                value={value}
                hint={hint}
                color={color}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CreditUrgencyCard({ overview }: { overview: DashboardOverview }) {
  const creditData = [
    ["Critical", overview.credit.critical],
    ["Warning", overview.credit.warning],
    ["Monitor", overview.credit.monitor],
    ["Stable", overview.credit.stable],
  ] as const;

  return (
    <div className="surface-elev flex h-full flex-col overflow-hidden">
      <PanelHeader
        eyebrow="Credit"
        title="Top-up urgency"
        hint="เฉพาะ active customers ที่ forecast credit ได้"
        icon={CreditCard}
      />
      <div className="flex-1 border-t border-[color:var(--line-2)] p-5">
        <div className="mb-4 rounded-[24px] border border-[color:var(--warn-bg)] bg-[color:var(--warn-bg)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--warn)]">
            Next top-up 7d
          </div>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div className="num text-[30px] font-semibold tracking-[-0.04em] text-[color:var(--ink-1)]">
              {formatNumber(overview.credit.next_topup_7d)}
            </div>
            <div className="pb-1 text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-5)]">
                30d usage
              </div>
              <div className="num mt-1 text-[12px] font-semibold text-[color:var(--ink-2)]">
                {formatCredits(overview.credit.predicted_usage_30d)}
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {creditData.map(([label, value]) => (
            <div key={label} className="rounded-[24px] border border-[color:var(--line)] bg-white p-4">
              <RiskListRow
                label={label}
                value={value}
                total={overview.active_churn.base_customers}
                totalLabel="active"
                color={CREDIT_PALETTE[label as keyof typeof CREDIT_PALETTE]}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthlyRevenueCard({ data }: { data: MonthlyRevenuePoint[] }) {
  const latest = data[data.length - 1];
  const first = data[0];
  const trendPct = first.revenue > 0 ? ((latest.revenue - first.revenue) / first.revenue) * 100 : 0;

  return (
    <section className="surface-elev overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
              Monthly revenue
            </p>
            <StatusPill tone={trendPct >= 0 ? "ok" : "warn"} dot={false}>
              {trendPct >= 0 ? "+" : ""}
              {trendPct.toFixed(1)}% vs first month
            </StatusPill>
          </div>
          <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-[color:var(--ink-1)]">
            รายได้รายเดือนจนถึงข้อมูลล่าสุด
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-[color:var(--ink-4)]">
            Production source: group `Backend_payment.amount` by `payment_date` month.
          </p>
        </div>
        <div className="rounded-2xl border border-[color:var(--moby-100)] bg-[color:var(--moby-50)] px-4 py-3 text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--moby-700)]">
            Latest
          </div>
          <div className="num mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[color:var(--ink-1)]">
            {formatCurrency(latest.revenue)}
          </div>
          <div className="mt-1 text-[11px] text-[color:var(--ink-5)]">
            {latest.month} · {latest.payments} payments
          </div>
        </div>
      </header>
      <div className="border-t border-[color:var(--line-2)] p-5">
        <MonthlyRevenueChart data={data} />
      </div>
    </section>
  );
}

function MonthlyRevenueChart({ data }: { data: MonthlyRevenuePoint[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = Math.max(720, data.length * 118);
  const height = 290;
  const padding = { top: 42, right: 30, bottom: 38, left: 74 };
  const values = data.map((point) => point.revenue);
  const min = Math.min(...values) * 0.94;
  const max = Math.max(...values) * 1.04;
  const range = max - min || 1;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = data.map((point, index) => {
    const x = padding.left + (index / (data.length - 1)) * plotWidth;
    const y = padding.top + plotHeight - ((point.revenue - min) / range) * plotHeight;
    return { ...point, x, y };
  });
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${padding.top + plotHeight} L${points[0].x},${padding.top + plotHeight} Z`;
  const gridValues = [max, min + range * 0.5, min];

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollLeft = scrollContainer.scrollWidth;
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_220px]">
      <div>
        <div className="mb-2 text-[11px] text-[color:var(--ink-5)]">
          Focus ล่าสุดประมาณ 6 เดือน · เลื่อนซ้ายเพื่อดูเดือนก่อนหน้า
        </div>
        <div ref={scrollRef} className="overflow-x-auto pb-1">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="min-w-[720px]"
            style={{ width }}
            aria-label="Monthly revenue trend chart"
          >
            <defs>
              <linearGradient id="dashboardMonthlyRevenueArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--moby-600)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--moby-600)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {gridValues.map((value) => {
              const y = padding.top + plotHeight - ((value - min) / range) * plotHeight;
              return (
                <g key={value}>
                  <line
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={y}
                    y2={y}
                    stroke="var(--line-2)"
                    strokeDasharray="5 7"
                  />
                  <text x={16} y={y + 4} className="fill-[color:var(--ink-5)] text-[11px]">
                    {formatCompactCurrency(value)}
                  </text>
                </g>
              );
            })}

            <path d={areaPath} fill="url(#dashboardMonthlyRevenueArea)" />
            <path d={linePath} fill="none" stroke="var(--moby-600)" strokeWidth="3" strokeLinecap="round" />

            {points.map((point) => (
              <g key={point.month}>
                <text
                  x={point.x}
                  y={point.y - 12}
                  textAnchor="middle"
                  className="fill-[color:var(--ink-2)] text-[10px] font-semibold"
                >
                  {formatCompactCurrency(point.revenue)}
                </text>
                <circle cx={point.x} cy={point.y} r="4.5" fill="white" stroke="var(--moby-600)" strokeWidth="3" />
                <text
                  x={point.x}
                  y={height - 14}
                  textAnchor="middle"
                  className="fill-[color:var(--ink-5)] text-[10px]"
                >
                  {formatMonth(point.month)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 2xl:grid-cols-1">
        {data.slice(-3).map((point) => (
          <div key={point.month} className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={13} className="text-[color:var(--moby-600)]" />
              <div className="text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-5)]">
                {point.month}
              </div>
            </div>
            <div className="num mt-2 text-[20px] font-semibold text-[color:var(--ink-1)]">
              {formatCurrency(point.revenue)}
            </div>
            <div className="mt-1 text-[11px] text-[color:var(--ink-5)]">
              {point.payments} payments
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelHeader({
  eyebrow,
  title,
  hint,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  hint: string;
  icon?: ElementType;
}) {
  return (
    <header className="flex items-start justify-between gap-4 px-5 py-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-5)]">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-[color:var(--ink-1)]">
          {title}
        </h2>
        <p className="mt-1 text-[12px] leading-5 text-[color:var(--ink-4)]">{hint}</p>
      </div>
      {Icon && (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color:var(--surface-2)] text-[color:var(--moby-600)]">
          <Icon size={16} />
        </span>
      )}
    </header>
  );
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ฿`;
  return `${value.toLocaleString()} ฿`;
}

function formatCompactCurrency(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return value.toLocaleString();
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M credits`;
  return `${value.toLocaleString()} credits`;
}

function formatMonth(value: string): string {
  const [, month] = value.split("-");
  const monthIndex = Number(month) - 1;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return names[monthIndex] ?? value;
}


