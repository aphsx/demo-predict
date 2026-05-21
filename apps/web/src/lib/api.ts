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

const BASE = process.env.NEXT_PUBLIC_API_URL;
const apiUrl = (path: string) => {
  if (!BASE) return path;
  const normalizedBase = BASE.replace(/\/$/, "");
  const normalizedPath = path.replace(/^\/api/, "");
  return `${normalizedBase}${normalizedPath}`;
};

async function apiFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Unauthorized");
  }
  return res;
}

export async function fetchRuns(): Promise<Run[]> {
  const res = await apiFetch(apiUrl("/api/runs"));
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`Expected array, got ${typeof data}`);
  return data;
}

export async function createRun(name: string, cutoff_date: string) {
  const res = await apiFetch(apiUrl("/api/runs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, cutoff_date }),
  });
  return res.json();
}

export async function deleteRun(id: string) {
  await apiFetch(apiUrl(`/api/runs/${id}`), { method: "DELETE" });
}

export async function uploadFile(runId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiFetch(apiUrl(`/api/runs/${runId}/upload`), { method: "POST", body: fd });
  return res.json();
}

export async function fetchRun(id: string) {
  const res = await apiFetch(apiUrl(`/api/runs/${id}`));
  return res.json();
}

export async function fetchSummary(runId: string) {
  const res = await apiFetch(apiUrl(`/api/runs/${runId}/summary`));
  return res.json();
}

export async function fetchPredictions(runId: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await apiFetch(apiUrl(`/api/runs/${runId}/predictions?${qs}`));
  return res.json();
}

export async function fetchCustomer(runId: string, accId: string) {
  const res = await apiFetch(apiUrl(`/api/runs/${runId}/predictions/${accId}`));
  return res.json();
}

export async function fetchCustomerExplain(runId: string, accId: string) {
  const res = await apiFetch(apiUrl(`/api/runs/${runId}/predictions/${accId}/explain`));
  return res.json();
}

export async function fetchModelMetrics() {
  const res = await apiFetch(apiUrl("/api/model-metrics"));
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchTrainingLog() {
  const res = await apiFetch(apiUrl("/api/training-log"));
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchModelVersions() {
  const res = await apiFetch(apiUrl("/api/model-versions"));
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchActiveModelVersions() {
  const res = await apiFetch(apiUrl("/api/model-versions/active"));
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function trainModels() {
  const res = await apiFetch(apiUrl("/api/model-versions/train"), { method: "POST" });
  return res.json();
}

export function subscribeRunStatus(runId: string, onUpdate: (data: RunStatusUpdate) => void): () => void {
  const url = new URL(apiUrl(`/api/runs/${runId}/stream`), window.location.origin);
  const es = new EventSource(url.toString(), { withCredentials: true });

  es.addEventListener("progress", (e) => {
    try { onUpdate(JSON.parse(e.data)); } catch {}
  });
  es.addEventListener("done", (e) => {
    try { onUpdate(JSON.parse(e.data)); } catch {}
    es.close();
  });
  es.onerror = () => es.close();
  return () => es.close();
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

export function exportUrl(runId: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return apiUrl(`/api/runs/${runId}/export?${qs}`);
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

/** Generate and persist a one-shot run explanation. */
export async function generateExplanation(runId: string): Promise<Explanation> {
  const res = await apiFetch(apiUrl(`/api/runs/${runId}/explain`), { method: "POST" });
  if (!res.ok) throw new Error(`Explain error ${res.status}`);
  return res.json();
}

/** Fetch the latest stored explanation for a run. Returns null if none yet. */
export async function fetchExplanation(runId: string): Promise<Explanation | null> {
  const res = await apiFetch(apiUrl(`/api/runs/${runId}/explanation`));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Fetch explanation error ${res.status}`);
  return res.json();
}

/**
 * Stream a chat response from Gemini via the /runs/:id/chat endpoint.
 * Calls `onChunk` with each text delta and `onDone` when the stream ends.
 * Returns a cleanup function that aborts the stream if called.
 */
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
      res = await fetch(apiUrl(`/api/runs/${runId}/chat`), {
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

export const api = {
  listRuns: fetchRuns,
  createRun: (arg: { name: string; cutoff_date: string }) => createRun(arg.name, arg.cutoff_date),
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
