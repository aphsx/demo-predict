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
