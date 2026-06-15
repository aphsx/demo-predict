/**
 * Canonical tone + label mapping for an ML run status (prediction + training).
 * Previously duplicated in features/runs/runs-utils.ts (a Record, with an invalid
 * "warm" tone) and features/training/training-run-utils.ts (functions). Unified
 * here as functions; `pending` maps to the valid "neutral" tone.
 */
import type { RunStatus } from "@/lib/ml-api";

/** Subset of the StatusPill tones used for run statuses. */
export type RunStatusTone = "brand" | "danger" | "info" | "neutral";

export function runStatusTone(status: RunStatus): RunStatusTone {
  if (status === "completed") return "brand";
  if (status === "failed") return "danger";
  if (status === "in_progress") return "info";
  return "neutral";
}

export function runStatusLabel(status: RunStatus): string {
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "in_progress") return "In progress";
  return "Pending";
}
