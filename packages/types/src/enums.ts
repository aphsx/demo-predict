/**
 * Canonical enum-like string constants shared across web, api, and ml.
 * These MUST stay in sync with apps/ml/src/constants.py.
 * Single source of truth — previously duplicated between apps/api/src/lib/constants.ts
 * and apps/web/src/lib/mlApi.ts.
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
  PROTECT: "High-Value At-Risk",
  STABILIZE: "Mid-Value At-Risk",
  GROW: "High-Value Stable",
  DEVELOP: "Emerging",
  MAINTAIN: "Stable",
  WATCH_LOW: "Low-Value Watch",
  SALVAGE_LOW: "Low-Value At-Risk",
  REACTIVATE: "Lapsed",
  DORMANT: "Dormant",
  GHOST: "Ghost",
} as const;
export type Segment = (typeof SEGMENT)[keyof typeof SEGMENT];

export const SEGMENT_ORDER: readonly Segment[] = [
  SEGMENT.PROTECT, SEGMENT.STABILIZE, SEGMENT.GROW, SEGMENT.DEVELOP, SEGMENT.MAINTAIN,
  SEGMENT.WATCH_LOW, SEGMENT.SALVAGE_LOW, SEGMENT.REACTIVATE, SEGMENT.DORMANT, SEGMENT.GHOST,
];

/** Ordered arrays for filter dropdowns. */
export const LIFECYCLE_STAGES: LifecycleStage[] = ["Active Paid", "Active Free", "Churned", "Ghost"];
export const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high", "critical"];
export const VALUE_TIERS: ValueTier[] = ["high", "mid", "low", "none"];
export const URGENCY_LEVELS: UrgencyLevel[] = ["critical", "warning", "monitor", "stable"];

/** Max customers shown in top-priority widget. Shared by web and api summary query. */
export const TOP_PRIORITY_LIMIT = 5;
