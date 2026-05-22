"use client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Run {
  id: string;
  name: string;
  status: string;
  cutoff_date: string;
  total_customers: number;
  active_customers: number;
  created_at: string;
  error_message?: string;
}

export interface RunStatusUpdate {
  status: string;
  progress?: number;
  step?: string;
  total_customers?: number;
  active_customers?: number;
  error_message?: string;
  updated_at?: string;
}

export interface PaginatedPredictions {
  total: number;
  page: number;
  page_size: number;
  data: Record<string, unknown>[];
}

export interface ModelVersion {
  id: string;
  model_type: string;
  version: string;
  trained_at: string;
  metrics_json: Record<string, unknown>;
  model_file_path: string;
  is_active: boolean;
}

export interface Explanation {
  id: string;
  run_id: string;
  content: string;
  model: string;
  created_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Core helper ───────────────────────────────────────────────────────────────

// All API calls go through /api/* which Next.js rewrites to Elysia server-side.
// Relative URL = same-origin = browser always includes the session cookie.
async function jFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

// ── Runs ──────────────────────────────────────────────────────────────────────

export async function fetchRuns(): Promise<Run[]> {
  return jFetch<Run[]>("/api/runs");
}

export async function createRun(name: string, cutoff_date: string): Promise<Run> {
  return jFetch<Run>("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, cutoff_date }),
  });
}

export async function deleteRun(id: string): Promise<void> {
  await jFetch(`/api/runs/${id}`, { method: "DELETE" });
}

export async function fetchRun(id: string): Promise<Run> {
  return jFetch<Run>(`/api/runs/${id}`);
}

// ── Predictions ───────────────────────────────────────────────────────────────

export async function fetchSummary(runId: string): Promise<Record<string, unknown>> {
  return jFetch<Record<string, unknown>>(`/api/runs/${runId}/summary`);
}

export async function fetchPredictions(
  runId: string,
  params: Record<string, string>,
): Promise<PaginatedPredictions> {
  const qs = new URLSearchParams(params).toString();
  return jFetch<PaginatedPredictions>(`/api/runs/${runId}/predictions${qs ? `?${qs}` : ""}`);
}

export async function fetchCustomer(
  runId: string,
  accId: string,
): Promise<Record<string, unknown>> {
  return jFetch<Record<string, unknown>>(`/api/runs/${runId}/predictions/${accId}`);
}

export async function fetchCustomerExplain(
  runId: string,
  accId: string,
): Promise<Record<string, unknown>> {
  return jFetch<Record<string, unknown>>(`/api/runs/${runId}/predictions/${accId}/explain`);
}

// ── Training / Admin ──────────────────────────────────────────────────────────

export async function fetchModelMetrics(): Promise<Record<string, unknown>> {
  return jFetch<Record<string, unknown>>("/api/model-metrics");
}

export async function fetchTrainingLog(): Promise<{ log: string }> {
  return jFetch<{ log: string }>("/api/training-log");
}

export async function fetchModelVersions(): Promise<ModelVersion[]> {
  return jFetch<ModelVersion[]>("/api/model-versions");
}

export async function fetchActiveModelVersions(): Promise<ModelVersion[]> {
  return jFetch<ModelVersion[]>("/api/model-versions/active");
}

export async function trainModels(cutoff_date?: string): Promise<Record<string, unknown>> {
  return jFetch<Record<string, unknown>>("/api/model-versions/train", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cutoff_date }),
  });
}

// ── File upload — multipart/form-data ────────────────────────────────────────

export async function uploadFile(runId: string, file: File): Promise<unknown> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/runs/${runId}/upload`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`Upload error ${res.status}`);
  return res.json();
}

// ── Export URL ────────────────────────────────────────────────────────────────

export function exportUrl(runId: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `/api/runs/${runId}/export${qs ? `?${qs}` : ""}`;
}

// ── SSE — EventSource ─────────────────────────────────────────────────────────

export function subscribeRunStatus(
  runId: string,
  onUpdate: (data: RunStatusUpdate) => void,
): () => void {
  const es = new EventSource(`/api/runs/${runId}/stream`, { withCredentials: true });
  es.addEventListener("progress", (e) => { try { onUpdate(JSON.parse(e.data)); } catch {} });
  es.addEventListener("done",     (e) => { try { onUpdate(JSON.parse(e.data)); } catch {} es.close(); });
  es.onerror = () => es.close();
  return () => es.close();
}

// ── LLM / Insights ───────────────────────────────────────────────────────────

export async function generateExplanation(runId: string): Promise<Explanation> {
  return jFetch<Explanation>(`/api/runs/${runId}/explain`, { method: "POST" });
}

export async function fetchExplanation(runId: string): Promise<Explanation | null> {
  const res = await fetch(`/api/runs/${runId}/explanation`, { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Fetch explanation error ${res.status}`);
  return res.json();
}

export function streamChat(
  runId: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    let res: Response;
    try {
      res = await fetch(`/api/runs/${runId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") onError(String(e));
      return;
    }

    if (!res.ok || !res.body) { onError(`HTTP ${res.status}`); return; }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";

    while (true) {
      let done: boolean; let value: Uint8Array | undefined;
      try { ({ done, value } = await reader.read()); } catch { break; }
      if (done) break;
      buf += dec.decode(value, { stream: true });

      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const payload = JSON.parse(line.slice(6)) as { text?: string; done?: boolean; error?: string };
          if (payload.error) { onError(payload.error); return; }
          if (payload.text)  onChunk(payload.text);
          if (payload.done)  { onDone(); return; }
        } catch { /* skip malformed line */ }
      }
    }
    onDone();
  })();

  return () => controller.abort();
}

// ── Convenience object ────────────────────────────────────────────────────────

export const api = {
  listRuns:          fetchRuns,
  createRun:         (arg: { name: string; cutoff_date: string }) => createRun(arg.name, arg.cutoff_date),
  deleteRun,
  uploadFile,
  fetchRun,
  fetchSummary,
  fetchPredictions,
  fetchCustomer,
  fetchModelMetrics,
  fetchTrainingLog,
  subscribeRunStatus,
};
