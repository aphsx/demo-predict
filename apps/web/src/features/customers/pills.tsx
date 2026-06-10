"use client";
/**
 * Page-specific pills for /customers + /customers/[id].
 * Risk / value tier / credit urgency levels come straight from
 * ml_prediction_outputs (OUTPUT-CONTRACT §3.4–3.6) — UI maps to colors only,
 * it never derives the level itself (DASHBOARD-SPEC §3).
 */

import { StatusPill } from "@/components/ui";
import type { RiskLevel, UrgencyLevel, ValueTier } from "@/lib/mlApi";

const RISK_STYLES: Record<RiskLevel, { fg: string; bg: string; border: string }> = {
  low: { fg: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  medium: { fg: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  high: { fg: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
  critical: { fg: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Churn risk pill — low blue / medium amber / high orange / critical red. */
export function RiskPill({ level }: { level: RiskLevel | null }) {
  if (!level) return <span className="text-[color:var(--ink-5)]">—</span>;
  const s = RISK_STYLES[level];
  return (
    <span className="pill" style={{ color: s.fg, background: s.bg, border: `1px solid ${s.border}` }}>
      <span className="dot" />
      {capitalize(level)}
    </span>
  );
}

const TIER_TONES: Record<ValueTier, "brand" | "violet" | "neutral"> = {
  high: "brand",
  mid: "violet",
  low: "neutral",
  none: "neutral",
};

/** Customer value tier pill (quantile of CLV within the run). */
export function TierPill({ tier }: { tier: ValueTier }) {
  if (tier === "none") return <span className="text-[color:var(--ink-5)]">—</span>;
  return (
    <StatusPill tone={TIER_TONES[tier]} dot={false}>
      {capitalize(tier)}
    </StatusPill>
  );
}

const URGENCY_TONES: Record<UrgencyLevel, "danger" | "warn" | "info" | "ok"> = {
  critical: "danger",
  warning: "warn",
  monitor: "info",
  stable: "ok",
};

/** Credit top-up urgency pill (critical ≤14d / warning ≤30d / monitor ≤90d). */
export function UrgencyPill({ level }: { level: UrgencyLevel | null }) {
  if (!level) return <span className="text-[color:var(--ink-5)]">—</span>;
  return <StatusPill tone={URGENCY_TONES[level]}>{capitalize(level)}</StatusPill>;
}
