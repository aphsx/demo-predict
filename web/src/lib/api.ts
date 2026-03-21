const BASE = process.env.NEXT_PUBLIC_API_URL || "";
const api = (path: string) => `${BASE}${path}`;

export async function fetchRuns() {
  const res = await fetch(api("/api/runs"));
  return res.json();
}

export async function createRun(name: string, cutoff_date: string) {
  const res = await fetch(api("/api/runs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, cutoff_date }),
  });
  return res.json();
}

export async function deleteRun(id: string) {
  await fetch(api(`/api/runs/${id}`), { method: "DELETE" });
}

export async function uploadFile(runId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(api(`/api/runs/${runId}/upload`), { method: "POST", body: fd });
  return res.json();
}

export async function fetchRun(id: string) {
  const res = await fetch(api(`/api/runs/${id}`));
  return res.json();
}

export async function fetchSummary(runId: string) {
  const res = await fetch(api(`/api/runs/${runId}/summary`));
  return res.json();
}

export async function fetchPredictions(runId: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(api(`/api/runs/${runId}/predictions?${qs}`));
  return res.json();
}

export async function fetchCustomer(runId: string, accId: string) {
  const res = await fetch(api(`/api/runs/${runId}/predictions/${accId}`));
  return res.json();
}

export async function fetchModelMetrics() {
  const res = await fetch(api("/api/model-metrics"));
  return res.json();
}

export async function fetchTrainingLog() {
  const res = await fetch(api("/api/training-log"));
  return res.json();
}

export function exportUrl(runId: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return api(`/api/runs/${runId}/export?${qs}`);
}
