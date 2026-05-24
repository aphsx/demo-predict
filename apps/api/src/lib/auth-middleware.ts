import { Elysia } from "elysia";
import { auth } from "../auth";
import { getDevAuthBypassUserId, isDevAuthBypassEnabled } from "./dev-auth";

/**
 * Derives { userId } on every request by reading the Better Auth session.
 * userId is null for unauthenticated requests.
 * Use `requireUser` (below) to enforce authentication on a route group.
 */
export const userPlugin = new Elysia({ name: "user-plugin" }).derive(
  { as: "global" },
  async ({ request }) => {
    if (isDevAuthBypassEnabled()) {
      return { userId: getDevAuthBypassUserId() };
    }

    const sessionData = await auth.api
      .getSession({ headers: request.headers })
      .catch(() => null);
    return { userId: sessionData?.user?.id ?? null };
  }
);

/**
 * Elysia plugin that guards a route group: responds 401 if no session.
 * Uses `as: "scoped"` so the guard does NOT propagate to the parent app
 * (i.e. /health and other public routes are unaffected).
 *
 * Usage:
 *   const myRoutes = new Elysia().use(requireUser).get("/protected", ...)
 */
export const requireUser = new Elysia({ name: "require-user" })
  .use(userPlugin)
  .onBeforeHandle({ as: "scoped" }, ({ userId, set }) => {
    if (!userId) {
      set.status = 401;
      return { message: "Not authenticated" };
    }
  });
