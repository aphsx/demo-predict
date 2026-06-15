import type { NextRequest } from "next/server";

const ELYSIA_URL = process.env.ELYSIA_URL ?? "http://localhost:3001";

/**
 * Server-side session check used by the Next.js middleware. Forwards the
 * request cookies to Better Auth's get-session endpoint on the API and returns
 * whether a valid authenticated user is attached. Never throws.
 *
 * NOTE: server-only (uses NextRequest + cross-service fetch). Do NOT import
 * from client components — use the `useSession` hook from `./client` there.
 */
export async function hasValidSession(request: NextRequest): Promise<boolean> {
  const cookie = request.headers.get("cookie");
  if (!cookie) return false;

  try {
    const res = await fetch(`${ELYSIA_URL}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const session = (await res.json()) as { user?: { id?: string } } | null;
    return Boolean(session?.user?.id);
  } catch {
    return false;
  }
}
