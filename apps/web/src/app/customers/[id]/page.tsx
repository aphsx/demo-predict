"use client";
export const dynamic = "force-dynamic";
import Link from "next/link";
import {
  ArrowLeft, Phone, Mail, Send, ChevronRight,
  CalendarClock, ShieldCheck, Activity,
} from "lucide-react";
import {
  PageHeader, SectionCard, StatusPill, ProgressMeter, Skeleton,
  lifecycleTone, urgencyTone,
} from "@/components/ui";

type PredictionOutput = {
  recommended_action: string | null;
  recommended_followup_date: string | null;
  ai_explanation: string | null;
  ai_recommended_message: string | null;
};

export default function Customer360() {
  return <CustomerSkeleton />;
}

/* ── inner ──────────────────────────────────────── */

function ActionBtn({ icon: Icon, children, primary }: any) {
  return (
    <button
      disabled
      title="Action workflow is not wired yet"
      className={`h-9 px-3 rounded-lg text-[13px] inline-flex items-center gap-1.5 cursor-not-allowed opacity-55 ${
      primary
        ? "bg-[color:var(--moby-600)] text-white hover:bg-[color:var(--moby-700)]"
        : "border border-[color:var(--line)] bg-white text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)]"
    }`}
    >
      <Icon size={14} /> {children}
    </button>
  );
}

function CustomerSkeleton() {
  return (
    <div className="pb-12">
      <PageHeader
        eyebrow={
          <Link href="/customers" className="inline-flex items-center gap-1 text-[color:var(--moby-700)] hover:underline">
            <ArrowLeft size={11} /> Customers
          </Link>
        }
        title="Account profile"
        actions={
          <div className="flex items-center gap-2">
            <ActionBtn icon={Phone}>Log call</ActionBtn>
            <ActionBtn icon={Mail}>Send email</ActionBtn>
            <ActionBtn icon={Send} primary>Trigger campaign</ActionBtn>
          </div>
        }
      />
      <div className="px-8 mt-4 space-y-5">
        <div className="surface p-5">
          <div className="flex items-center gap-5 flex-wrap">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="flex-1 min-w-[260px] space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-20" />
              </div>
              <div className="flex flex-wrap gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <SectionCard title="Churn analysis" hint="ความน่าจะเป็นที่จะเลิกใช้ใน 6 เดือน">
            <div className="flex justify-center">
              <Skeleton className="h-[136px] w-[180px] rounded-full" />
            </div>
            <div className="mt-5">
              <PendingMiniCard rows={3} />
            </div>
          </SectionCard>
          <SectionCard title="Lifetime value" hint="คาดการณ์ 6 เดือนข้างหน้า">
            <PendingMiniCard rows={4} />
          </SectionCard>
          <SectionCard title="Credit forecast" hint="คาดการณ์การใช้เครดิตจากผล ML v2">
            <PendingMiniCard rows={4} />
          </SectionCard>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <SectionCard title="Engagement summary">
            <PendingMiniCard rows={4} />
          </SectionCard>
          <SectionCard title="Recommended next step">
            <PendingMiniCard rows={3} />
          </SectionCard>
        </div>
        <div className="text-[11px] text-[color:var(--ink-5)] flex items-center gap-3 px-1">
          <ShieldCheck size={11} /> Output from lifecycle / churn / clv / credit components
          <span className="opacity-50">·</span>
          point-in-time safe (cutoff respected)
        </div>
      </div>
    </div>
  );
}

function PendingMiniCard({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="space-y-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-full" />
        </div>
      ))}
    </div>
  );
}

function Recommendation({ customer }: { customer: PredictionOutput }) {
  if (!customer.recommended_action && !customer.recommended_followup_date && !customer.ai_explanation) {
    return <PendingMiniCard rows={3} />;
  }

  return (
    <div className="space-y-4">
      <KV label="Recommended action" value={customer.recommended_action ?? "—"} accent="blue" />
      <KV label="Follow-up date" value={customer.recommended_followup_date ?? "—"} />
      {customer.ai_explanation && (
        <div className="rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3 text-[12px] leading-5 text-[color:var(--ink-3)]">
          {customer.ai_explanation}
        </div>
      )}
      {customer.ai_recommended_message && (
        <KV label="AI recommended message" value={customer.ai_recommended_message} />
      )}
    </div>
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

function formatNumber(value: number | null) {
  return value == null ? "—" : Number(value).toLocaleString();
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
