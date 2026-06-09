"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import type { ElementType } from "react";
import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  Gem,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";
import { StatusPill } from "@/components/ui";

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
    avg_probability: number;
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
  action_queue: {
    label: string;
    count: number;
    hint: string;
    tone: "danger" | "warn" | "info" | "brand" | "neutral" | "ok";
  }[];
};

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
    avg_probability: 0.31,
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
  action_queue: [
    {
      label: "Call high-value risk",
      count: 41,
      hint: "High CLV + high churn risk",
      tone: "danger",
    },
    {
      label: "Top-up follow-up",
      count: 52,
      hint: "Estimated top-up within 7 days",
      tone: "warn",
    },
    {
      label: "Activate ghost accounts",
      count: 187,
      hint: "Signed up but never activated",
      tone: "neutral",
    },
  ],
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
                  high-value risk, active churn risk, value at risk, credit urgency และ action queue ที่ต้องตามต่อ
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
              <Link
                href="/playbooks"
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/22 bg-white/12 px-4 text-[13px] font-semibold text-white"
              >
                Action queue <ArrowRight size={13} />
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

      <section className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-2">
        <div className="surface-elev flex h-full flex-col overflow-hidden">
          <PanelHeader
            eyebrow="Portfolio"
            title="Lifecycle mix"
            hint="สัดส่วนลูกค้า active, churned และ ghost"
          />
          <div className="flex-1 border-t border-[color:var(--line-2)] p-4">
            <div className="divide-y divide-[color:var(--line-2)] rounded-2xl border border-[color:var(--line)] bg-white">
              {Object.entries(overview.lifecycle).map(([stage, count]) => (
                <LifecycleRow
                  key={stage}
                  label={stage}
                  value={count}
                  total={overview.totals.customers}
                  hint={lifecycleHint(stage)}
                  color={LIFECYCLE_PALETTE[stage as keyof typeof LIFECYCLE_PALETTE]}
                />
              ))}
            </div>
          </div>
        </div>

        <RiskCard overview={overview} />
        <ValueCard overview={overview} />
        <DistributionCard
          icon={CreditCard}
          eyebrow="Credit"
          title="Top-up urgency"
          hint="เฉพาะ active customers ที่ forecast credit ได้"
          data={{
            Critical: overview.credit.critical,
            Warning: overview.credit.warning,
            Monitor: overview.credit.monitor,
            Stable: overview.credit.stable,
          }}
          palette={CREDIT_PALETTE}
        />
      </section>

      <section className="surface-elev overflow-hidden">
        <PanelHeader
          eyebrow="Action queue"
          title="เรื่องที่ทีมควรทำก่อน"
          hint="สรุปจาก priority_score, lifecycle, churn, credit forecast และ recommended_action"
        />
        <div className="grid grid-cols-1 gap-4 border-t border-[color:var(--line-2)] p-5 md:grid-cols-3">
          {overview.action_queue.map((item) => (
            <ActionSummaryCard key={item.label} {...item} />
          ))}
        </div>
      </section>

      <section className="surface p-4">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[color:var(--ink-5)]">
          <ShieldCheck size={12} />
          Mock dashboard data is isolated in `MOCK_OVERVIEW`
          <span className="opacity-50">·</span>
          API-ready shape: totals / lifecycle / active_churn / value / credit / action_queue
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

function LifecycleRow({
  label,
  hint,
  color,
  value,
  total,
}: {
  label: string;
  hint: string;
  color: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0 flex flex-1 items-center gap-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-[color:var(--ink-1)]">{label}</div>
          <div className="mt-0.5 truncate text-[11.5px] text-[color:var(--ink-5)]">{hint}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-2)]">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
          </div>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="num text-[17px] font-semibold text-[color:var(--ink-1)]">{formatNumber(value)}</div>
        <div className="num text-[11px] text-[color:var(--ink-5)]">{pct.toFixed(1)}%</div>
      </div>
    </div>
  );
}

function DistributionCard({
  icon: Icon,
  eyebrow,
  title,
  hint,
  data,
  palette,
}: {
  icon: ElementType;
  eyebrow: string;
  title: string;
  hint: string;
  data: Record<string, number>;
  palette: Record<string, string>;
}) {
  const total = Object.values(data).reduce((sum, value) => sum + value, 0);

  return (
    <div className="surface-elev flex h-full flex-col overflow-hidden">
      <PanelHeader eyebrow={eyebrow} title={title} hint={hint} icon={Icon} />
      <div className="flex-1 space-y-4 border-t border-[color:var(--line-2)] p-5">
        {Object.entries(data).map(([row, value]) => {
          const pct = total > 0 ? (value / total) * 100 : 0;
          return (
          <div key={row}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-[12px] font-medium text-[color:var(--ink-2)]">{row}</span>
              <span className="num text-[12px] font-semibold text-[color:var(--ink-2)]">
                {formatNumber(value)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[color:var(--surface-2)]">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: palette[row] }} />
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function RiskCard({ overview }: { overview: DashboardOverview }) {
  const churnData = {
    High: overview.active_churn.high,
    Medium: overview.active_churn.medium,
    Low: overview.active_churn.low,
  };
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
        <div className="mb-4 rounded-2xl border border-[color:var(--danger-bg)] bg-[color:var(--danger-bg)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--danger)]">
            High-risk active
          </div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div className="num text-[30px] font-semibold text-[color:var(--danger)]">
              {formatNumber(overview.active_churn.high)}
            </div>
            <div className="num text-[12px] text-[color:var(--ink-4)]">
              {highPct.toFixed(1)}% of active
            </div>
          </div>
        </div>
        <DistributionRows data={churnData} palette={CHURN_PALETTE} />
        <div className="mt-4 text-[11.5px] text-[color:var(--ink-5)]">
          Average active churn probability: {(overview.active_churn.avg_probability * 100).toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

function ValueCard({ overview }: { overview: DashboardOverview }) {
  const valueData = {
    "High value": overview.value.high_value,
    "Mid value": overview.value.mid_value,
    "Low value": overview.value.low_value,
  };

  return (
    <div className="surface-elev flex h-full flex-col overflow-hidden">
      <PanelHeader
        eyebrow="Value"
        title="CLV concentration"
        hint="ใช้ดูว่าความเสี่ยงกระทบลูกค้ากลุ่มมูลค่าสูงแค่ไหน"
        icon={Gem}
      />
      <div className="flex-1 border-t border-[color:var(--line-2)] p-5">
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[.10em] text-[color:var(--ink-5)]">Predicted CLV</div>
            <div className="num mt-1 text-[24px] font-semibold text-[color:var(--ink-1)]">
              {formatCurrency(overview.value.predicted_clv_6m)}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[.10em] text-[color:var(--ink-5)]">High value at risk</div>
            <div className="num mt-1 text-[24px] font-semibold text-[color:var(--danger)]">
              {formatNumber(overview.value.high_value_at_risk)}
            </div>
          </div>
        </div>
        <DistributionRows
          data={valueData}
          palette={{
            "High value": "var(--moby-600)",
            "Mid value": "var(--info)",
            "Low value": "var(--ink-5)",
          }}
        />
      </div>
    </div>
  );
}

function ActionSummaryCard({
  label,
  count,
  hint,
  tone,
}: {
  label: string;
  count: number;
  hint: string;
  tone: "danger" | "warn" | "info" | "brand" | "neutral" | "ok";
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--line)] bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-5)]">
        {label}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="num text-[30px] font-semibold text-[color:var(--ink-1)]">
          {formatNumber(count)}
        </div>
        <StatusPill tone={tone} dot={false}>queue</StatusPill>
      </div>
      <div className="mt-3 text-[11.5px] leading-5 text-[color:var(--ink-4)]">
        {hint}
      </div>
    </div>
  );
}

function DistributionRows({ data, palette }: { data: Record<string, number>; palette: Record<string, string> }) {
  const total = Object.values(data).reduce((sum, value) => sum + value, 0);

  return (
    <div className="space-y-4">
      {Object.entries(data).map(([label, value]) => {
        const pct = total > 0 ? (value / total) * 100 : 0;
        return (
        <div key={label}>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-[12px] font-medium text-[color:var(--ink-2)]">{label}</span>
            <span className="num text-[12px] font-semibold text-[color:var(--ink-2)]">
              {formatNumber(value)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[color:var(--surface-2)]">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: palette[label] }} />
          </div>
        </div>
        );
      })}
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

function lifecycleHint(stage: string): string {
  if (stage === "Active Paid") return "จ่ายเงินแล้วและยังใช้งานอยู่";
  if (stage === "Active Free") return "ยังใช้งานอยู่แต่ยังไม่จ่าย";
  if (stage === "Churned") return "หยุดใช้งานตาม observed lifecycle";
  return "สมัครแล้วแต่ยังไม่เกิด activation";
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ฿`;
  return `${value.toLocaleString()} ฿`;
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M credits`;
  return `${value.toLocaleString()} credits`;
}
