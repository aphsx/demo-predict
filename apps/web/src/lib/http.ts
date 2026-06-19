/**
 * Shared HTTP plumbing for the web API clients (`api.ts` + `ml-api.ts`).
 * Centralizes the mock toggle, error-shape guard, lazy mock loader, and the
 * cookie-credentialed fetch that redirects to /login on 401.
 */

/** When set, every client function serves from the deterministic mock in src/mocks/ml.ts. */
export const IS_ML_MOCK = process.env.NEXT_PUBLIC_ML_USE_MOCK === "1";

/** Lazily load the mock provider so the real-API path never bundles it eagerly. */
export function loadMlMock() {
  return import("@/mocks/ml");
}

/** Narrowing guard for the API's `{ message }` error body. */
export function isApiError(data: unknown): data is { message: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof (data as { message: unknown }).message === "string"
  );
}

/**
 * fetch() with cookie credentials that redirects to /login on 401 (browser only).
 * Used for JSON GETs and for file-upload / SSE / streaming responses.
 */
export async function redirectingFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Unauthorized");
  }
  return res;
}
