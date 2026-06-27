/**
 * [NEW] Elysia → FastAPI internal job trigger (ML v2).
 *
 * The ML service authenticates internal calls with the shared
 * INTERNAL_SERVICE_TOKEN (see apps/ml/api/main.py).
 */

export async function triggerMlJob(path: string, payload: object): Promise<void> {
  const token = process.env.INTERNAL_SERVICE_TOKEN?.trim();
  if (!token) throw new Error("INTERNAL_SERVICE_TOKEN environment variable is not set");

  const base = process.env.ML_INTERNAL_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": token,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Attach the upstream status so callers can distinguish a client/state error
    // raised by the ML service (e.g. 400 from a guard) from a 5xx outage.
    throw Object.assign(
      new Error(
        `ML job trigger ${path} failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`
      ),
      { upstreamStatus: res.status }
    );
  }
}
