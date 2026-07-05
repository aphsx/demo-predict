import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { USER_ROLE, type UserRole } from "@moby/types";
import { auth } from "../auth";
import { db } from "../db/client";
import { user } from "../db/schema";

/**
 * Admin bootstrap: comma-separated ADMIN_EMAILS. A session whose email is in
 * this list is treated as admin regardless of the `user.role` column, and the
 * column is upserted to 'admin' in the background so the DB converges.
 */
const ADMIN_EMAILS: ReadonlySet<string> = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

/** Minimal session-user shape we read (Better Auth returns additionalFields). */
interface SessionUser {
  id: string;
  email?: string | null;
  role?: string | null;
}

function resolveRole(sessionUser: SessionUser): UserRole {
  if (sessionUser.email && ADMIN_EMAILS.has(sessionUser.email.toLowerCase())) {
    if (sessionUser.role !== USER_ROLE.ADMIN) {
      // Nice-to-have convergence — never block the request on it.
      db.update(user)
        .set({ role: USER_ROLE.ADMIN, updatedAt: new Date() })
        .where(eq(user.id, sessionUser.id))
        .catch((e: unknown) =>
          console.error("[auth] Failed to persist bootstrap admin role:", e)
        );
    }
    return USER_ROLE.ADMIN;
  }
  return sessionUser.role === USER_ROLE.ADMIN ? USER_ROLE.ADMIN : USER_ROLE.MEMBER;
}

/**
 * Derives { userId, userRole, isAdmin } on every request by reading the Better
 * Auth session. All null/false for unauthenticated requests.
 * Use `requireUser` / `requireAdmin` (below) to enforce access on a route group.
 */
export const userPlugin = new Elysia({ name: "user-plugin" }).derive(
  { as: "global" },
  async ({ request }) => {
    const sessionData = await auth.api
      .getSession({ headers: request.headers })
      .catch(() => null);
    const sessionUser = (sessionData?.user ?? null) as SessionUser | null;
    if (!sessionUser) {
      return { userId: null, userRole: null as UserRole | null, isAdmin: false };
    }
    const userRole = resolveRole(sessionUser);
    return {
      userId: sessionUser.id,
      userRole: userRole as UserRole | null,
      isAdmin: userRole === USER_ROLE.ADMIN,
    };
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

/**
 * Guard for admin-only route groups: 401 without a session, 403 for
 * authenticated non-admins. Compose exactly like `requireUser`:
 *
 *   const adminRoutes = new Elysia().use(requireAdmin).post("/import", ...)
 */
export const requireAdmin = new Elysia({ name: "require-admin" })
  .use(userPlugin)
  .onBeforeHandle({ as: "scoped" }, ({ userId, isAdmin, set }) => {
    if (!userId) {
      set.status = 401;
      return { message: "Not authenticated" };
    }
    if (!isAdmin) {
      set.status = 403;
      return {
        message: "This action requires the admin role",
        error_code: "admin_role_required",
      };
    }
  });
