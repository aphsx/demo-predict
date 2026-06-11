import type { TrainDataSource } from "@/lib/api";
import { MOBY_BRAND } from "@/lib/login-brand-colors";

export const IMPORT_ACCENT = MOBY_BRAND.orange;
export const IMPORT_PROGRESS_BG = `linear-gradient(90deg, ${MOBY_BRAND.orangeWarm} 0%, ${MOBY_BRAND.orange} 100%)`;
export const BRAND_BLUE = MOBY_BRAND.blue;

export type CleanCounts = {
  customers: number;
  payments: number;
  usage: number;
};

export function getCleanCounts(source: TrainDataSource | null): CleanCounts | null {
  const cleanManifest = source?.clean_manifest;
  if (!cleanManifest || typeof cleanManifest !== "object" || Array.isArray(cleanManifest)) return null;
  const clean = (cleanManifest as Record<string, unknown>).clean;
  if (!clean || typeof clean !== "object" || Array.isArray(clean)) return null;
  const counts = clean as Record<string, unknown>;
  return {
    customers: Number(counts.customers ?? 0),
    payments: Number(counts.payments ?? 0),
    usage: Number(counts.usage ?? 0),
  };
}

export function statusTone(status: string): "ok" | "danger" | "neutral" | "info" {
  if (status === "ready") return "ok";
  if (status === "failed") return "danger";
  if (status === "cleaning" || status === "importing") return "info";
  return "neutral";
}

export function statusLabel(status: string): string {
  if (status === "ready") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "cleaning") return "Cleaning";
  if (status === "importing") return "Importing";
  return "No dataset";
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH");
}

export function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getTimestamp(value?: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForTrainingHealth(): Promise<void> {
  const maxAttempts = 36;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const res = await fetch("/api/health");
    if (res.ok) {
      const data = await res.json();
      if (data.models?.churn && data.models?.clv && data.models?.credit) {
        return;
      }
    }
    await wait(5000);
  }
  throw new Error("Training finished too slowly - health check timed out");
}
