/**
 * [NEW] Elysia → FastAPI internal job trigger (ML v2).
 *
 * The ML service authenticates internal calls with the shared
 * INTERNAL_SERVICE_TOKEN (see apps/ml/api/main.py).
 */

export async function triggerMlJob(path: string, payload: object): Promise<void> {
  const base = process.env.ML_INTERNAL_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN ?? "",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `ML job trigger ${path} failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`
    );
  }
}
