/**
 * [NEW] Elysia → FastAPI internal job trigger (ML v2).
 *
 * The ML service authenticates internal calls with the shared
 * INTERNAL_SERVICE_TOKEN (see apps/ml/api/main.py).
 *
 * Every call is bounded by an AbortController timeout (ML_INTERNAL_TIMEOUT_MS,
 * default 30s) — a hung ML service must surface as a thrown error so callers
 * can mark the run 'failed' instead of leaving it stuck.
 */

const DEFAULT_ML_INTERNAL_TIMEOUT_MS = 30_000;

function mlInternalTimeoutMs(): number {
  const parsed = Number(process.env.ML_INTERNAL_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ML_INTERNAL_TIMEOUT_MS;
}

export async function triggerMlJob(path: string, payload: object): Promise<void> {
  const token = process.env.INTERNAL_SERVICE_TOKEN?.trim();
  if (!token) throw new Error("INTERNAL_SERVICE_TOKEN environment variable is not set");

  const base = process.env.ML_INTERNAL_URL ?? "http://localhost:8000";
  const timeoutMs = mlInternalTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": token,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error(`ML job trigger ${path} timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }

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
