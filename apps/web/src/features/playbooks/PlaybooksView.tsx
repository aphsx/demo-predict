"use client";

import { useMemo, useState, type ElementType, type ReactNode } from "react";
import Link from "next/link";
import {
  Phone, Mail, Send, ChevronRight, Check,
  Flame, Sparkles, ShieldOff, Wallet,
} from "lucide-react";
import {
  PageHeader, SectionCard, StatusPill, Skeleton,
  lifecycleTone,
} from "@/components/ui";
import type { PredictionOutput } from "@/lib/api";

type LaneId = "active_paid" | "active_free" | "churned" | "ghost";

/** Subset of ML output columns shown in the action queue. */
export type QueueRow = Pick<
  PredictionOutput,
  | "acc_id"
  | "lifecycle_stage"
  | "recommended_action"
  | "priority_reason"
  | "churn_probability"
  | "recommended_followup_date"
  | "predicted_clv_6m"
  | "priority_score"
>;

const LANES: { id: LaneId; title: string; hint: string; icon: ElementType; tone: string; filters: Record<string, string> }[] = [
  {
    id: "active_paid", title: "Active Paid",
    hint: "ลูกค้าที่กำลังใช้งานอยู่",
    icon: ShieldOff, tone: "rose",
    filters: { lifecycle_stage: "Active Paid" },
  },
  {
    id: "active_free", title: "Active Free",
    hint: "ลูกค้าที่ยังไม่เคยจ่าย",
    icon: Wallet, tone: "amber",
    filters: { lifecycle_stage: "Active Free" },
  },
  {
    id: "churned", title: "Churned",
    hint: "ลูกค้าที่เลิกใช้ไปแล้ว",
    icon: Flame, tone: "violet",
    filters: { lifecycle_stage: "Churned" },
  },
  {
    id: "ghost", title: "Ghost",
    hint: "สมัครแล้วแต่ไม่เคยใช้",
    icon: Sparkles, tone: "blue",
    filters: { lifecycle_stage: "Ghost" },
  },
];

export function PlaybooksView({ data }: { data: Partial<Record<LaneId, QueueRow[]>> }) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const totalQueue = useMemo(
    () => Object.values(data).reduce((sum, arr) => sum + arr.length, 0),
    [data]
  );
  const awaitingQueue = true;
  const doneToday = doneIds.size;
  const completion = totalQueue ? doneToday / totalQueue : 0;

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Today · Sales floor"
        title="Action queue"
        actions={
          <Link href="/customers" className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-[13px] text-[color:var(--ink-2)] hover:bg-gray-50">
            Browse all customers
          </Link>
        }
      />

      <div className="px-8 mt-4 space-y-5">
        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {awaitingQueue ? (
            <>
              <Skeleton className="h-[116px]" />
              <Skeleton className="h-[116px]" />
              <Skeleton className="h-[116px]" />
            </>
          ) : (
            <>
              <KpiTile label="Calls in queue" value={totalQueue} hint="ตามลำดับ priority" tone="blue" />
              <KpiTile label="Completed" value={doneToday} hint="ในรอบเซสชันนี้" tone="emerald" />
              <KpiTile label="Completion" value={`${(completion * 100).toFixed(0)}%`} hint="กรอบงานวันนี้" tone="violet" raw />
            </>
          )}
        </div>

        {/* Lanes */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {LANES.map(lane => (
            <Lane key={lane.id} lane={lane}
              rows={data[lane.id] || []}
              loading={awaitingQueue}
              done={doneIds}
              onToggle={(id: string) => setDoneIds(prev => {
                const n = new Set(prev);
                if (n.has(id)) n.delete(id); else n.add(id);
                return n;
              })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Lane({
  lane, rows, loading, done, onToggle,
}: {
  lane: (typeof LANES)[number];
  rows: QueueRow[];
  loading: boolean;
  done: Set<string>;
  onToggle: (id: string) => void;
}) {
  const Icon = lane.icon;
  const palette: Record<string, { bg: string; fg: string }> = {
    rose:   { bg: "var(--danger-bg)", fg: "var(--danger)" },
    amber:  { bg: "var(--warn-bg)",   fg: "var(--warn)" },
    violet: { bg: "#f5f3ff",          fg: "#6d28d9" },
    blue:   { bg: "var(--moby-50)",   fg: "var(--moby-700)" },
  };
  const p = palette[lane.tone];

  return (
    <SectionCard
      title={
        <span className="inline-flex items-center gap-2">
          <span className="w-7 h-7 grid place-items-center rounded-md" style={{ background: p.bg, color: p.fg }}>
            <Icon size={14} />
          </span>
          {lane.title}
        </span>
      }
      hint={lane.hint}
      right={
        <Link
          href={`/customers?${new URLSearchParams(lane.filters).toString()}`}
          className="inline-flex items-center text-[12px] text-[color:var(--ink-3)] hover:text-[color:var(--moby-600)] hover:underline"
        >
          See all <ChevronRight size={11} />
        </Link>
      }
    >
      {(loading || rows.length === 0) && <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
      {!loading && rows.length > 0 && (
        <ul className="-mx-5 -my-5 divide-y divide-gray-100">
          {sortByPriority(rows).map((r) => {
            const isDone = done.has(String(r.acc_id));
            return (
              <li key={r.acc_id} className={`flex gap-3 p-4 items-start hover:bg-gray-50 ${isDone ? "opacity-50" : ""}`}>
                {/* Check */}
                <button
                  onClick={() => onToggle(String(r.acc_id))}
                  className={`mt-0.5 w-5 h-5 rounded-md border grid place-items-center transition-colors ${
                    isDone
                      ? "bg-[color:var(--ok)] border-[color:var(--ok)]"
                      : "bg-white border-gray-200 hover:border-[color:var(--ok)]"
                  }`}
                >
                  {isDone && <Check size={12} className="text-white" />}
                </button>
                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link href={`/customers/${r.acc_id}`}
                      className={`num text-[13px] font-medium text-[color:var(--ink-2)] hover:underline ${isDone ? "line-through" : ""}`}>
                      {r.acc_id}
                    </Link>
                    <div className="flex items-center gap-1.5">
                      <StatusPill tone={lifecycleTone(r.lifecycle_stage ?? "")}>{r.lifecycle_stage ?? "—"}</StatusPill>
                    </div>
                  </div>
                  <div className="text-[11.5px] text-[color:var(--ink-4)] mt-1.5">
                    {r.recommended_action || r.priority_reason || (
                      <>Churn {r.churn_probability != null ? `${(r.churn_probability * 100).toFixed(1)}%` : "—"}</>
                    )}
                  </div>
                  {r.recommended_followup_date && (
                    <div className="text-[11px] text-[color:var(--ink-5)] mt-1">
                      Follow up: {r.recommended_followup_date}
                    </div>
                  )}
                  {/* Inline actions */}
                  <div className="flex items-center gap-2 mt-2">
                    <ChipBtn icon={Phone}>Call</ChipBtn>
                    <ChipBtn icon={Mail}>Email</ChipBtn>
                    <ChipBtn icon={Send}>Campaign</ChipBtn>
                  </div>
                </div>
                {/* CLV */}
                <div className="text-right shrink-0">
                  {Number(r.predicted_clv_6m ?? 0) > 0 && (
                    <>
                      <div className="text-[10px] uppercase tracking-[.10em] text-[color:var(--ink-5)]">CLV</div>
                      <div className="num text-[13px] font-semibold">
                        {Number(r.predicted_clv_6m).toLocaleString()} ฿
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function ChipBtn({ icon: Icon, children }: { icon: ElementType; children: ReactNode }) {
  return (
    <button
      disabled
      title="Action workflow is not wired yet"
      className="h-7 px-2 rounded-md border border-gray-200 bg-white text-[11.5px] text-[color:var(--ink-3)] inline-flex items-center gap-1 cursor-not-allowed opacity-55"
    >
      <Icon size={11} /> {children}
    </button>
  );
}

function KpiTile({
  label,
  value,
  hint,
  tone,
  raw = false,
}: {
  label: string;
  value: number | string;
  hint: string;
  tone: "blue" | "emerald" | "violet";
  raw?: boolean;
}) {
  const col = { blue: "var(--moby-700)", emerald: "var(--ok)", violet: "#6d28d9" }[tone];
  return (
    <div className="surface p-5">
      <div className="text-[11px] uppercase tracking-[.10em] text-[color:var(--ink-5)]">{label}</div>
      <div className="num text-[28px] font-semibold mt-1.5" style={{ color: col }}>{raw ? value : Number(value).toLocaleString()}</div>
      <div className="text-[11.5px] text-[color:var(--ink-5)] mt-0.5">{hint}</div>
    </div>
  );
}

function sortByPriority(rows: QueueRow[]): QueueRow[] {
  return [...rows].sort((a, b) => Number(b.priority_score ?? 0) - Number(a.priority_score ?? 0));
}
