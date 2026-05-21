import { Elysia } from "elysia";
import { auth } from "../auth";

/**
 * Derives { userId } on every request by reading the Better Auth session.
 * userId is null for unauthenticated requests.
 * Use `requireUser` (below) to enforce authentication on a route group.
 */
export const userPlugin = new Elysia({ name: "user-plugin" }).derive(
  { as: "global" },
  async ({ request }) => {
    const sessionData = await auth.api
      .getSession({ headers: request.headers })
      .catch(() => null);
    return { userId: sessionData?.user?.id ?? null };
  }
);

/**
 * Elysia plugin that guards a route group: responds 401 if no session.
 *
 * Usage:
 *   app.use(requireUser).get("/protected", ({ userId }) => ({ userId }))
 */
export const requireUser = new Elysia({ name: "require-user" })
  .use(userPlugin)
  .onBeforeHandle({ as: "global" }, ({ userId, set }) => {
    if (!userId) {
      set.status = 401;
      return { message: "Not authenticated" };
    }
  });
