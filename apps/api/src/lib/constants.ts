/**
 * Canonical enum-like string constants shared across services.
 *
 * These MUST stay in sync with apps/ml/src/constants.py — the ML pipeline writes
 * these exact strings and the API/web read them. Centralizing avoids scattered
 * string literals (a typo here vs. there is a silent contract break the compiler
 * cannot catch).
 */

export const RUN_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

export const OUTPUT_STATUS = {
  PREDICTED: "predicted",
  PARTIAL: "partial",
  INSUFFICIENT_DATA: "insufficient_data",
} as const;
export type OutputStatus = (typeof OUTPUT_STATUS)[keyof typeof OUTPUT_STATUS];

export const LIFECYCLE_STAGE = {
  ACTIVE_PAID: "Active Paid",
  ACTIVE_FREE: "Active Free",
  CHURNED: "Churned",
  GHOST: "Ghost",
} as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGE)[keyof typeof LIFECYCLE_STAGE];

export const SUB_STAGE = {
  ACTIVE_PAID: "Active Paid",
  ACTIVE_FREE: "Active Free",
  CHURNED_PAID: "Churned Paid",
  CHURNED_FREE: "Churned Free",
  GHOST: "Ghost",
} as const;
export type SubStage = (typeof SUB_STAGE)[keyof typeof SUB_STAGE];

export const RISK_LEVEL = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const;
export type RiskLevel = (typeof RISK_LEVEL)[keyof typeof RISK_LEVEL];

export const URGENCY_LEVEL = {
  STABLE: "stable",
  MONITOR: "monitor",
  WARNING: "warning",
  CRITICAL: "critical",
} as const;
export type UrgencyLevel = (typeof URGENCY_LEVEL)[keyof typeof URGENCY_LEVEL];

export const VALUE_TIER = {
  HIGH: "high",
  MID: "mid",
  LOW: "low",
  NONE: "none",
} as const;
export type ValueTier = (typeof VALUE_TIER)[keyof typeof VALUE_TIER];

export const AI_STATUS = {
  NOT_REQUESTED: "not_requested",
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;
export type AiStatus = (typeof AI_STATUS)[keyof typeof AI_STATUS];

export const SEGMENT = {
  PROTECT: "Protect",
  STABILIZE: "Stabilize",
  GROW: "Grow",
  DEVELOP: "Develop",
  MAINTAIN: "Maintain",
  WATCH_LOW: "Watch-low",
  SALVAGE_LOW: "Salvage-low",
  REACTIVATE: "Reactivate",
  DORMANT: "Dormant",
  GHOST: "Ghost",
} as const;
export type Segment = (typeof SEGMENT)[keyof typeof SEGMENT];

/** Work-list priority order (top first). */
export const SEGMENT_ORDER: readonly Segment[] = [
  SEGMENT.PROTECT, SEGMENT.STABILIZE, SEGMENT.GROW, SEGMENT.DEVELOP, SEGMENT.MAINTAIN,
  SEGMENT.WATCH_LOW, SEGMENT.SALVAGE_LOW, SEGMENT.REACTIVATE, SEGMENT.DORMANT, SEGMENT.GHOST,
];

// ── Shared validation patterns ──────────────────────────────────

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
