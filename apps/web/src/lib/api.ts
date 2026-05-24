/**
 * API client — Eden Treaty for typed CRUD routes, manual fetch for SSE / streaming / file ops.
 *
 * Eden Treaty (elysia client) gives end-to-end type safety: if an Elysia route's
 * input or output shape changes, TypeScript flags it here immediately.
 *
 * Manual fetch is kept for:
 *   - subscribeRunStatus  — EventSource (GET SSE, browser-native)
 *   - uploadPredictDataForRun — multipart (predict raw)
 *   - exportUrl           — returns a URL string for <a href>, not a fetch call
 *   - streamChat          — POST SSE via fetch + AbortController
 *   - generateExplanation / fetchExplanation — simple POST/GET, kept manual for clarity
 */

import { elysia } from "./eden";

// ── helpers ─────────────────────────────────────────────────────────────────

// Eden Treaty return types are { data: success | error-shape | null, error: E | null }.
function isApiError(data: unknown): data is { message: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof (data as { message: unknown }).message === "string"
  );
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function unwrap<T>(result: { data: unknown; error: unknown }): T {
  if (result.error) {
    const err = result.error;
    throw err instanceof Error ? err : new Error(String(err));
  }
  if (result.data == null) throw new Error("API returned no data");
  if (isApiError(result.data)) throw new Error(result.data.message);
  return result.data as T;
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

// ── Runs — manual fetch (Eden treaty mishandles GET /runs list in this setup) ─

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("API returned invalid JSON");
  }
}

export async function fetchRuns(): Promise<Run[]> {
  const res = await apiFetch("/api/runs");
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Failed to load runs (${res.status})`);
  }
  return asArray<Run>(body);
}

export async function createRun(name: string, cutoff_date: string): Promise<Run> {
  const res = await apiFetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, cutoff_date }),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Failed to create run (${res.status})`);
  }
  return body as Run;
}

export async function deleteRun(id: string): Promise<void> {
  const res = await apiFetch(`/api/runs/${id}`, { method: "DELETE" });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Failed to delete run (${res.status})`);
  }
}

export async function fetchRun(id: string): Promise<Run> {
  const res = await apiFetch(`/api/runs/${id}`);
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Failed to load run (${res.status})`);
  }
  return body as Run;
}

export interface PaginatedPredictions {
  total: number;
  page: number;
  page_size: number;
  data: Record<string, unknown>[];
}

const EMPTY_PAGE: PaginatedPredictions = {
  total: 0,
  page: 1,
  page_size: 50,
  data: [],
};

function asPaginated(value: unknown): PaginatedPredictions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return EMPTY_PAGE;
  }
  const o = value as Record<string, unknown>;
  return {
    total: Number(o.total ?? 0),
    page: Number(o.page ?? 1),
    page_size: Number(o.page_size ?? 50),
    data: asArray<Record<string, unknown>>(o.data),
  };
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
  const res = await apiFetch(`/api/runs/${runId}/summary`);
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Failed to load summary (${res.status})`);
  }
  return asRecord(body);
}

export async function fetchPredictions(
  runId: string,
  params: Record<string, string>
): Promise<PaginatedPredictions> {
  const qs = new URLSearchParams(params).toString();
  const res = await apiFetch(`/api/runs/${runId}/predictions${qs ? `?${qs}` : ""}`);
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Failed to load predictions (${res.status})`);
  }
  return asPaginated(body);
}

export async function fetchCustomer(
  runId: string,
  accId: string
): Promise<Record<string, unknown>> {
  const res = await apiFetch(`/api/runs/${runId}/predictions/${accId}`);
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Customer not found (${res.status})`);
  }
  return asRecord(body);
}

export async function fetchCustomerExplain(
  runId: string,
  accId: string
): Promise<Record<string, unknown>> {
  const res = await apiFetch(`/api/runs/${runId}/predictions/${accId}/explain`);
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Explain failed (${res.status})`);
  }
  return asRecord(body);
}

// ── Training / model health — manual fetch (Eden mishandles these routes) ─────

export async function fetchModelMetrics(): Promise<Record<string, unknown>> {
  const res = await apiFetch("/api/model-metrics");
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      isApiError(body) ? body.message : `Failed to load model metrics (${res.status})`
    );
  }
  return asRecord(body);
}

export async function fetchTrainingLog(): Promise<{ log: string }> {
  const res = await apiFetch("/api/training-log");
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      isApiError(body) ? body.message : `Failed to load training log (${res.status})`
    );
  }
  const rec = asRecord(body);
  return { log: typeof rec.log === "string" ? rec.log : "" };
}

export async function fetchModelVersions(): Promise<ModelVersion[]> {
  const res = await apiFetch("/api/model-versions");
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      isApiError(body) ? body.message : `Failed to load model versions (${res.status})`
    );
  }
  return asArray<ModelVersion>(body);
}

export async function fetchActiveModelVersions(): Promise<ModelVersion[]> {
  const res = await apiFetch("/api/model-versions/active");
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      isApiError(body) ? body.message : `Failed to load active model versions (${res.status})`
    );
  }
  return asArray<ModelVersion>(body);
}

export async function trainModels(cutoff_date?: string): Promise<Record<string, unknown>> {
  return unwrap<Record<string, unknown>>(
    await elysia["model-versions"].train.post({ cutoff_date })
  );
}

// ── [NEW] Train raw data import ───────────────────────────────────────────────
// train_data_sources + train_raw_sheet_*. NOT uploadFile (/runs).
// See docs/DATA-PIPELINE-MIGRATION.md

export interface TrainDataSource {
  id: string;
  name: string;
  client_label: string | null;
  original_filename: string;
  file_checksum_sha256: string;
  file_size_bytes: number | null;
  import_status: string;
  imported_at: string | null;
  sheet_manifest: Record<string, number> | null;
  notes: string | null;
  error_message: string | null;
  imported_by: string | null;
  importer_name: string | null;
  importer_email: string | null;
  created_at: string;
}

export async function fetchTrainDataSources(): Promise<TrainDataSource[]> {
  const res = await apiFetch("/api/train-data-sources");
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      isApiError(body) ? body.message : `Failed to load train data sources (${res.status})`
    );
  }
  return asArray<TrainDataSource>(body);
}

export async function uploadTrainDataFile(
  file: File,
  name: string,
  client_label?: string
): Promise<{
  source_id: string;
  import_status: string;
  sheet_manifest: Record<string, number>;
  file_checksum_sha256: string;
}> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("name", name);
  if (client_label) fd.append("client_label", client_label);

  const res = await apiFetch("/api/train-data-sources/import", { method: "POST", body: fd });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Import failed (${res.status})`);
  }
  return body as {
    source_id: string;
    import_status: string;
    sheet_manifest: Record<string, number>;
    file_checksum_sha256: string;
  };
}

// ── [NEW] Predict raw data import (per run) ───────────────────────────────────
// predict_data_sources + predict_raw_sheet_*. Replaces uploadFile when wired on /runs.

export async function uploadPredictDataForRun(
  runId: string,
  file: File
): Promise<{
  source_id: string;
  prediction_run_id: string | null;
  import_status: string;
  sheet_manifest: Record<string, number>;
  file_checksum_sha256: string;
}> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("prediction_run_id", runId);

  const res = await apiFetch("/api/predict-data-sources/import", { method: "POST", body: fd });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Import failed (${res.status})`);
  }
  return body as {
    source_id: string;
    prediction_run_id: string | null;
    import_status: string;
    sheet_manifest: Record<string, number>;
    file_checksum_sha256: string;
  };
}

export async function retryRun(runId: string): Promise<{ run_id: string; status: string; message: string }> {
  const res = await apiFetch(`/api/runs/${runId}/retry`, { method: "POST" });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Failed to retry run (${res.status})`);
  }
  return body as { run_id: string; status: string; message: string };
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
  uploadPredictDataForRun,
  fetchRun,
  fetchSummary,
  fetchPredictions,
  fetchCustomer,
  fetchModelMetrics,
  fetchTrainingLog,
  subscribeRunStatus,
};
