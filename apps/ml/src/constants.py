"""Canonical enum-like string constants shared across the ML pipeline.

These values are part of the cross-service contract: the API (TypeScript) reads
the exact same strings the ML writer produces (see apps/api/src/lib/constants.ts,
which must stay in sync). Centralizing them here removes the scattered string
literals (CLAUDE.md code style: magic strings -> constants) so a typo cannot
silently drift between the writer and the reader.
"""

from __future__ import annotations

from typing import Final


class RunStatus:
    PENDING: Final = "pending"  # initial state set by the API before the runner starts
    IN_PROGRESS: Final = "in_progress"
    COMPLETED: Final = "completed"
    FAILED: Final = "failed"


class OutputStatus:
    PREDICTED: Final = "predicted"
    PARTIAL: Final = "partial"
    INSUFFICIENT_DATA: Final = "insufficient_data"


class LifecycleStage:
    ACTIVE_PAID: Final = "Active Paid"
    ACTIVE_FREE: Final = "Active Free"
    CHURNED: Final = "Churned"
    GHOST: Final = "Ghost"

    ACTIVE: Final = ("Active Paid", "Active Free")


class SubStage:
    ACTIVE_PAID: Final = "Active Paid"
    ACTIVE_FREE: Final = "Active Free"
    CHURNED_PAID: Final = "Churned Paid"
    CHURNED_FREE: Final = "Churned Free"
    GHOST: Final = "Ghost"


class RiskLevel:
    LOW: Final = "low"
    MEDIUM: Final = "medium"
    HIGH: Final = "high"
    CRITICAL: Final = "critical"


class UrgencyLevel:
    STABLE: Final = "stable"
    MONITOR: Final = "monitor"
    WARNING: Final = "warning"
    CRITICAL: Final = "critical"


class ValueTier:
    HIGH: Final = "high"
    MID: Final = "mid"
    LOW: Final = "low"
    NONE: Final = "none"


class AiStatus:
    NOT_REQUESTED: Final = "not_requested"
    PENDING: Final = "pending"
    COMPLETED: Final = "completed"
    FAILED: Final = "failed"


class Segment:
    PROTECT: Final = "High-Value At-Risk"
    STABILIZE: Final = "Mid-Value At-Risk"
    GROW: Final = "High-Value Stable"
    DEVELOP: Final = "Emerging"
    MAINTAIN: Final = "Stable"
    WATCH_LOW: Final = "Low-Value Watch"
    SALVAGE_LOW: Final = "Low-Value At-Risk"
    REACTIVATE: Final = "Lapsed"
    DORMANT: Final = "Dormant"
    GHOST: Final = "Ghost"

    # Work-list priority order (top first) + retention subset (ranked by money).
    ORDER: Final = (
        "High-Value At-Risk", "Mid-Value At-Risk", "High-Value Stable", "Emerging", "Stable",
        "Low-Value Watch", "Low-Value At-Risk", "Lapsed", "Dormant", "Ghost",
    )
    RETENTION: Final = ("High-Value At-Risk", "Mid-Value At-Risk", "Low-Value At-Risk", "Low-Value Watch")


class DerivedThresholds:
    """Numeric cutoffs used at prediction time to bucket customers.

    ML-INTERNAL — these are NOT part of the string contract mirrored in
    apps/api/src/lib/constants.ts; they never cross the service boundary as
    values, only the resulting labels do. Centralized here (instead of scattered
    literals in prediction/runner.py) so a cut cannot silently drift between the
    two places that read it (usage_trend vs segment `growing`, at-risk health vs
    needs_review), per CLAUDE.md "magic numbers -> constants".

    The p_alive health cuts below are FALLBACKS: the real cuts are derived
    per-model from the validation p_alive distribution at training time and
    shipped in the CLV artifact's thresholds.json (mirrors how churn risk
    thresholds travel with the churn model). These constants are used only for
    legacy CLV artifacts trained before that shipped.
    """

    # Value tier — percentile cuts applied to the CURRENT run's CLV distribution.
    # Relative by construction, so the THB boundary auto-adapts to data scale;
    # only the percentile policy ("top decile = high, top half = mid") is fixed.
    VALUE_TIER_HIGH_PCT: Final = 0.90
    VALUE_TIER_MID_PCT: Final = 0.50

    # Usage momentum band. usage_change_90d_pct is already a normalized ratio,
    # so ±10% is scale-free and does not drift under absolute-volume shift.
    MOMENTUM_BAND: Final = 0.10

    # Credit urgency day cutoffs — operational SLA policy owned by ops, not a
    # statistical property of the data (an absolute-days forecast is invariant).
    URGENCY_CRITICAL_DAYS: Final = 14
    URGENCY_WARNING_DAYS: Final = 30
    URGENCY_MONITOR_DAYS: Final = 90

    # p_alive health cuts — FALLBACK for legacy artifacts (see class docstring).
    P_ALIVE_ATRISK_FALLBACK: Final = 0.20
    P_ALIVE_WATCH_FALLBACK: Final = 0.50

    # Churn ABSTENTION. A customer whose tenure is shorter than the churn
    # feature windows has them mostly zero-filled — no prior-90d usage, no
    # 6-month slope — so the churn score is driven by defaults, not real
    # behaviour: a confident-looking number the model has no basis for. Below
    # this tenure we abstain (churn eligibility → insufficient_data, no risk
    # level emitted) rather than hand an account manager a guess.
    #
    # Keyed on TENURE, not payment count: this is a prepaid business (buy credit
    # once, use it for months), so a single-payment customer still has rich
    # usage signal — n_purchases is not what zero-fills the features. 90 days =
    # under one recent-90d window; ~11% of active-paid on the reference data.
    CHURN_ABSTAIN_MIN_TENURE_DAYS: Final = 90

    # Training-time derivation of the per-model p_alive cuts: pick the validation
    # p_alive quantile at these target flag-rates, then clamp to the band below so
    # a degenerate cohort can't produce an absurd cut. Deriving from quantiles
    # keeps the FLAG-RATE stable across runs even when the p_alive scale shifts
    # with purchase cadence / observation window — the concrete p_alive value
    # adapts to each model instead of a fixed 0.20 meaning different things.
    P_ALIVE_ATRISK_RATE: Final = 0.15
    P_ALIVE_WATCH_RATE: Final = 0.40
    P_ALIVE_ATRISK_CLAMP: Final = (0.10, 0.30)
    P_ALIVE_WATCH_CLAMP: Final = (0.35, 0.60)
