/**
 * API client — Eden Treaty for typed CRUD routes, manual fetch for SSE / streaming / file ops.
 *
 * Eden Treaty (elysia client) gives end-to-end type safety: if an Elysia route's
 * input or output shape changes, TypeScript flags it here immediately.
 *
 * Manual fetch is kept for:
 *   - subscribeRunStatus  — EventSource (GET SSE, browser-native)
 *   - uploadFile          — multipart/form-data
 *   - exportUrl           — returns a URL string for <a href>, not a fetch call
 *   - streamChat          — POST SSE via fetch + AbortController
 *   - generateExplanation / fetchExplanation — simple POST/GET, kept manual for clarity
 */

import { elysia } from "./eden";

// ── helpers ─────────────────────────────────────────────────────────────────

// Eden Treaty return types are { data: success | error-shape | null, error: E | null }.
// We throw on error and cast to the explicit return type declared on each function.
// The double-cast is intentional: Date fields in Drizzle become strings after JSON
// serialisation, so the TypeScript types diverge from the runtime values.
function unwrap<T>(result: { data: unknown; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as unknown as T;
}

/** Manual fetch — used only for file upload, SSE, and streaming routes. */
async function apiFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Unauthorized");
  }
  return res;
}

// ── Shared types ─────────────────────────────────────────────────────────────

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

// ── Runs — Eden Treaty ───────────────────────────────────────────────────────

export async function fetchRuns(): Promise<Run[]> {
  return unwrap<Run[]>(await elysia.runs.get());
}

export async function createRun(name: string, cutoff_date: string) {
  return unwrap(await elysia.runs.post({ name, cutoff_date }));
}

export async function deleteRun(id: string) {
  return unwrap(await elysia.runs({ id }).delete());
}

export async function fetchRun(id: string) {
  return unwrap(await elysia.runs({ id }).get());
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

export async function fetchSummary(runId: string): Promise<Record<string, unknown>> {
  return unwrap<Record<string, unknown>>(await elysia.runs({ id: runId }).summary.get());
}

export async function fetchPredictions(
  runId: string,
  params: Record<string, string>
): Promise<PaginatedPredictions> {
  return unwrap<PaginatedPredictions>(
    await elysia.runs({ id: runId }).predictions.get({ query: params as never })
  );
}

export async function fetchCustomer(
  runId: string,
  accId: string
): Promise<Record<string, unknown>> {
  return unwrap<Record<string, unknown>>(
    await elysia.runs({ id: runId }).predictions({ acc_id: accId }).get()
  );
}

export async function fetchCustomerExplain(
  runId: string,
  accId: string
): Promise<Record<string, unknown>> {
  return unwrap<Record<string, unknown>>(
    await elysia.runs({ id: runId }).predictions({ acc_id: accId }).explain.get()
  );
}

// ── Training — Eden Treaty ────────────────────────────────────────────────────

export async function fetchModelMetrics(): Promise<Record<string, unknown>> {
  return unwrap<Record<string, unknown>>(await elysia["model-metrics"].get());
}

export async function fetchTrainingLog(): Promise<{ log: string }> {
  return unwrap<{ log: string }>(await elysia["training-log"].get());
}

export async function fetchModelVersions(): Promise<ModelVersion[]> {
  return unwrap<ModelVersion[]>(await elysia["model-versions"].get());
}

export async function fetchActiveModelVersions(): Promise<ModelVersion[]> {
  return unwrap<ModelVersion[]>(await elysia["model-versions"].active.get());
}

export async function trainModels(cutoff_date?: string): Promise<Record<string, unknown>> {
  return unwrap<Record<string, unknown>>(
    await elysia["model-versions"].train.post({ cutoff_date })
  );
}

// ── File upload — manual fetch (multipart/form-data) ──────────────────────────

export async function uploadFile(runId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiFetch(`/api/runs/${runId}/upload`, { method: "POST", body: fd });
  return res.json();
}

// ── Export URL — returns href string for <a> tags ─────────────────────────────

export function exportUrl(runId: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return `/api/runs/${runId}/export${qs ? `?${qs}` : ""}`;
}

// ── SSE — EventSource (GET-based streaming) ───────────────────────────────────

export function subscribeRunStatus(
  runId: string,
  onUpdate: (data: RunStatusUpdate) => void
): () => void {
  const es = new EventSource(`/api/runs/${runId}/stream`, { withCredentials: true });
  es.addEventListener("progress", (e) => { try { onUpdate(JSON.parse(e.data)); } catch {} });
  es.addEventListener("done",     (e) => { try { onUpdate(JSON.parse(e.data)); } catch {} es.close(); });
  es.onerror = () => es.close();
  return () => es.close();
}

// ── LLM / Insights — manual fetch ────────────────────────────────────────────

export async function generateExplanation(runId: string): Promise<Explanation> {
  const res = await apiFetch(`/api/runs/${runId}/explain`, { method: "POST" });
  if (!res.ok) throw new Error(`Explain error ${res.status}`);
  return res.json();
}

export async function fetchExplanation(runId: string): Promise<Explanation | null> {
  const res = await apiFetch(`/api/runs/${runId}/explanation`);
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

// ── Convenience object (preserves existing call sites) ───────────────────────

export const api = {
  listRuns:         fetchRuns,
  createRun:        (arg: { name: string; cutoff_date: string }) => createRun(arg.name, arg.cutoff_date),
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
