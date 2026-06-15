"use client";

import { MOBY_BRAND } from "@/lib/login-brand-colors";
import type { ProfileSnapshot } from "@/lib/ml-api";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return Math.round(value).toLocaleString();
}

function daysAgo(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diff < 0) return null;
  if (diff === 0) return "วันนี้";
  return `${diff.toLocaleString()} วันก่อน`;
}

const STATUS_COLOR: Record<string, string> = {
  PAID: MOBY_BRAND.blue,
  TRIAL: "#9ca3af",
};

const CHANNEL_SHARES = [
  { key: "bc_usage_share", label: "BC", color: "#8b5cf6" },
  { key: "api_usage_share", label: "API", color: "#06b6d4" },
  { key: "otp_usage_share", label: "OTP", color: MOBY_BRAND.orangeWarm },
] as const;

export function CustomerProfilePanel({ snapshot }: { snapshot: ProfileSnapshot }) {
  return (
    <div className="space-y-4">
      {/* Service status */}
      <div className="grid grid-cols-2 gap-3">
        <ServiceCard
          label="SMS"
          status={snapshot.status_sms}
          credit={snapshot.credit_sms}
          expire={snapshot.expire_sms}
        />
        <ServiceCard
          label="Email"
          status={snapshot.status_email}
          credit={snapshot.credit_email}
          expire={snapshot.expire_email}
        />
      </div>

      {/* Lifecycle dates */}
      <div className="grid grid-cols-3 gap-3">
        <DateFact label="Joined" value={formatDate(snapshot.join_date)} hint={`${snapshot.customer_age_days.toLocaleString()} วัน`} />
        <DateFact label="Last access" value={formatDate(snapshot.last_access)} hint={daysAgo(snapshot.last_access) ?? "—"} />
        <DateFact label="Last send" value={formatDate(snapshot.last_send)} hint={daysAgo(snapshot.last_send) ?? "—"} />
      </div>

      {/* Channel usage share (last 180d) */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
            Usage share · 180d
          </p>
          <span className="num text-[11.5px] text-[color:var(--ink-4)]">
            {formatCompact(snapshot.usage_total_180d)} credits
          </span>
        </div>
        <div className="space-y-2.5">
          {CHANNEL_SHARES.map((c) => {
            const share = snapshot[c.key] ?? 0;
            return (
              <div key={c.key} className="flex items-center gap-3">
                <span className="w-9 shrink-0 text-[11px] font-semibold text-[color:var(--ink-4)]">{c.label}</span>
                <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[rgba(13,17,35,0.06)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${Math.max(0, Math.min(100, share * 100))}%`, backgroundColor: c.color }}
                  />
                </div>
                <span className="num w-10 shrink-0 text-right text-[11.5px] font-semibold text-[color:var(--ink-2)]">
                  {(share * 100).toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ServiceCard({
  label,
  status,
  credit,
  expire,
}: {
  label: string;
  status: string | null;
  credit: number;
  expire: string | null;
}) {
  const color = status ? STATUS_COLOR[status] ?? "#9ca3af" : "#9ca3af";
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
          {label}
        </span>
        {status ? (
          <span
            className="inline-flex h-[20px] items-center rounded-full px-2 text-[10px] font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            {status}
          </span>
        ) : null}
      </div>
      <p className="num mt-2 text-[18px] font-semibold text-[color:var(--ink-1)]">
        {formatCompact(credit)}
      </p>
      <p className="text-[10.5px] text-[color:var(--ink-5)]">credits · หมดอายุ {formatDate(expire)}</p>
    </div>
  );
}

function DateFact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-[color:var(--ink-5)]">
        {label}
      </p>
      <p className="num mt-1 text-[12.5px] font-semibold text-[color:var(--ink-1)]">{value}</p>
      <p className="mt-0.5 text-[11px] text-[color:var(--ink-4)]">{hint}</p>
    </div>
  );
}
