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
const apiUrl = (path: string) => BASE ? `${BASE}${path}` : path;

export async function fetchRuns(): Promise<Run[]> {
  const res = await fetch(apiUrl("/api/runs"));
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`Expected array, got ${typeof data}`);
  return data;
}

export async function createRun(name: string, cutoff_date: string) {
  const res = await fetch(apiUrl("/api/runs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, cutoff_date }),
  });
  return res.json();
}

export async function deleteRun(id: string) {
  await fetch(apiUrl(`/api/runs/${id}`), { method: "DELETE" });
}

export async function uploadFile(runId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(apiUrl(`/api/runs/${runId}/upload`), { method: "POST", body: fd });
  return res.json();
}

export async function fetchRun(id: string) {
  const res = await fetch(apiUrl(`/api/runs/${id}`));
  return res.json();
}

export async function fetchSummary(runId: string) {
  const res = await fetch(apiUrl(`/api/runs/${runId}/summary`));
  return res.json();
}

export async function fetchPredictions(runId: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(apiUrl(`/api/runs/${runId}/predictions?${qs}`));
  return res.json();
}

export async function fetchCustomer(runId: string, accId: string) {
  const res = await fetch(apiUrl(`/api/runs/${runId}/predictions/${accId}`));
  return res.json();
}

export async function fetchCustomerExplain(runId: string, accId: string) {
  const res = await fetch(apiUrl(`/api/runs/${runId}/predictions/${accId}/explain`));
  return res.json();
}

export async function fetchModelMetrics() {
  const res = await fetch(apiUrl("/api/model-metrics"));
  return res.json();
}

export async function fetchTrainingLog() {
  const res = await fetch(apiUrl("/api/training-log"));
  return res.json();
}

export async function fetchModelVersions() {
  const res = await fetch(apiUrl("/api/model-versions"));
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchActiveModelVersions() {
  const res = await fetch(apiUrl("/api/model-versions/active"));
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function trainModels() {
  const res = await fetch(apiUrl("/api/model-versions/train"), { method: "POST" });
  return res.json();
}

export function subscribeRunStatus(runId: string, onUpdate: (data: RunStatusUpdate) => void): () => void {
  const es = new EventSource(apiUrl(`/api/runs/${runId}/stream`));
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onUpdate(data);
    } catch {}
  };
  es.onerror = () => es.close();
  return () => es.close();
}

export interface RunStatusUpdate {
  status: string;
  total_customers?: number;
  active_customers?: number;
  error_message?: string;
  updated_at?: string;
}

export function exportUrl(runId: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return apiUrl(`/api/runs/${runId}/export?${qs}`);
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
