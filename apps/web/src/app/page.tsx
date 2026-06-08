"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  CreditCard,
  Gem,
  MessageSquareText,
  ShieldCheck,
  Target,
  UsersRound,
} from "lucide-react";
import { Skeleton, StatusPill } from "@/components/ui";

const LIFECYCLE_STAGES = [
  { label: "Active Paid", hint: "ใช้งานอยู่และเคยจ่าย", color: "var(--c-paid)" },
  { label: "Active Free", hint: "ใช้งานอยู่แต่ยังไม่เคยจ่าย", color: "var(--c-free)" },
  { label: "Churned", hint: "หยุดใช้งานแล้ว", color: "var(--c-churn)" },
  { label: "Ghost", hint: "สมัครแล้วแต่ยังไม่ใช้งาน", color: "var(--c-ghost)" },
] as const;

const CHURN_BUCKETS = ["High risk", "Medium risk", "Low risk"] as const;
const VALUE_TIERS = ["High value", "Mid value", "Low value"] as const;
const CREDIT_URGENCY = ["Critical", "Warning", "Monitor", "Stable"] as const;

const ACTION_SUMMARY = [
  { label: "Need follow-up", field: "recommended_followup_date" },
  { label: "Has recommended action", field: "recommended_action" },
  { label: "AI message ready", field: "ai_recommended_message" },
] as const;

const PREVIEW_COLUMNS = [
  "acc_id",
  "lifecycle_stage",
  "churn_risk_level",
  "predicted_clv_6m",
  "credit_urgency_level",
  "priority_score",
  "recommended_action",
] as const;

export default function Dashboard() {
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
                <StatusPill tone="neutral" dot={false}>UI only</StatusPill>
              </div>

              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/68">
                  ML v2 output summary
                </p>
                <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-[42px]">
                  Dashboard
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/78 sm:text-[15px]">
                  ภาพรวมจากผล prediction เช่นจำนวนลูกค้าแต่ละ lifecycle, churn risk,
                  CLV/value tier, credit urgency และ action ที่ควรทำ ถ้ายังไม่มี API จริงค่าจะเป็น skeleton
                </p>
              </div>
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
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={UsersRound} label="Total customers" hint="all output rows" />
        <MetricCard icon={Target} label="High churn risk" hint="churn_risk_level = High" />
        <MetricCard icon={Gem} label="Revenue at risk" hint="sum revenue_at_risk" />
        <MetricCard icon={CalendarClock} label="Follow-ups due" hint="recommended_followup_date" />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="surface-elev overflow-hidden">
          <PanelHeader
            eyebrow="Lifecycle overview"
            title="ลูกค้าแต่ละสถานะมีทั้งหมดกี่คน"
            hint="นับจาก `lifecycle_stage` และ `sub_stage` ใน output row"
          />
          <div className="border-t border-[color:var(--line-2)] p-5">
            <div className="mb-5">
              <Skeleton className="h-3 w-full rounded-full" />
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                {LIFECYCLE_STAGES.map((stage) => (
                  <div key={stage.label} className="flex items-center gap-2 text-[11.5px] text-[color:var(--ink-4)]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                    {stage.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {LIFECYCLE_STAGES.map((stage) => (
                <LifecycleCard key={stage.label} {...stage} />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <DistributionCard
            icon={Target}
            eyebrow="Churn"
            title="Risk distribution"
            hint="จำนวนลูกค้าแยกตาม `churn_risk_level`"
            rows={CHURN_BUCKETS}
          />
          <DistributionCard
            icon={CreditCard}
            eyebrow="Credit"
            title="Credit urgency"
            hint="จำนวนลูกค้าแยกตาม `credit_urgency_level`"
            rows={CREDIT_URGENCY}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <DistributionCard
          icon={Gem}
          eyebrow="Value"
          title="CLV / value tiers"
          hint="กลุ่มมูลค่าจาก `customer_value_tier` และ `predicted_clv_6m`"
          rows={VALUE_TIERS}
        />
        <div className="surface-elev overflow-hidden xl:col-span-2">
          <PanelHeader
            eyebrow="Action summary"
            title="งานที่ควรเกิดจาก prediction output"
            hint="สรุปจาก priority, recommended action, follow-up date และ AI message"
          />
          <div className="grid grid-cols-1 gap-4 border-t border-[color:var(--line-2)] p-5 md:grid-cols-3">
            {ACTION_SUMMARY.map((item) => (
              <ActionSummaryCard key={item.label} {...item} />
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="surface-elev overflow-hidden">
          <PanelHeader
            eyebrow="Customer preview"
            title="ตัวอย่าง output row ที่จะใช้แสดงใน Customers"
            hint="ยังไม่เชื่อม API จึงแสดงเฉพาะ skeleton cells"
          />
          <div className="overflow-x-auto border-t border-[color:var(--line-2)]">
            <table className="table-base">
              <thead>
                <tr>
                  {PREVIEW_COLUMNS.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, rowIndex) => (
                  <tr key={rowIndex}>
                    {PREVIEW_COLUMNS.map((column, colIndex) => (
                      <td key={column}>
                        <Skeleton className={colIndex === 0 ? "h-4 w-16" : "h-4 w-28"} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          <div className="surface-elev overflow-hidden">
            <PanelHeader
              eyebrow="AI output"
              title="AI enrichment"
              hint="สถานะข้อความ AI ที่ถูก persist ใน output"
            />
            <div className="space-y-4 border-t border-[color:var(--line-2)] p-5">
              <StatusRow icon={Bot} label="Generated" field="ai_status" />
              <StatusRow icon={MessageSquareText} label="Recommended message" field="ai_recommended_message" />
              <StatusRow icon={ShieldCheck} label="Model used" field="ai_model" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  hint: string;
}) {
  return (
    <div className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-5)]">
            {label}
          </div>
          <Skeleton className="mt-3 h-8 w-24" />
        </div>
        <Icon size={17} className="text-[color:var(--moby-600)]" />
      </div>
      <div className="mt-3 text-[11.5px] text-[color:var(--ink-5)]">{hint}</div>
    </div>
  );
}

function LifecycleCard({
  label,
  hint,
  color,
}: {
  label: string;
  hint: string;
  color: string;
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--line)] bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="mt-1 h-9 w-1 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-[color:var(--ink-1)]">{label}</div>
              <div className="mt-0.5 text-[11.5px] text-[color:var(--ink-5)]">{hint}</div>
            </div>
            <Skeleton className="h-8 w-16" />
          </div>
          <Skeleton className="mt-4 h-2 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}

function DistributionCard({
  icon: Icon,
  eyebrow,
  title,
  hint,
  rows,
}: {
  icon: React.ElementType;
  eyebrow: string;
  title: string;
  hint: string;
  rows: readonly string[];
}) {
  return (
    <div className="surface-elev overflow-hidden">
      <PanelHeader eyebrow={eyebrow} title={title} hint={hint} icon={Icon} />
      <div className="space-y-4 border-t border-[color:var(--line-2)] p-5">
        {rows.map((row) => (
          <div key={row}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-[12px] font-medium text-[color:var(--ink-2)]">{row}</span>
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionSummaryCard({ label, field }: { label: string; field: string }) {
  return (
    <div className="rounded-[20px] border border-[color:var(--line)] bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[.10em] text-[color:var(--ink-5)]">
        {label}
      </div>
      <Skeleton className="mt-3 h-8 w-20" />
      <div className="mt-3 rounded-lg bg-[color:var(--surface-2)] px-2 py-1.5 text-[11px] text-[color:var(--ink-4)]">
        {field}
      </div>
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  field,
}: {
  icon: React.ElementType;
  label: string;
  field: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-[color:var(--surface-2)] text-[color:var(--moby-600)]">
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] font-medium text-[color:var(--ink-2)]">{label}</span>
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="mt-1 text-[11px] text-[color:var(--ink-5)]">{field}</div>
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
  icon?: React.ElementType;
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
