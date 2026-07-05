/**
 * Web auth module — single import surface for client-side auth.
 *
 *   import { useSession, signIn, signOut, updateUser, deleteUser } from "@/lib/auth";
 *   import { sanitizeRedirectParam } from "@/lib/auth";
 *
 * Server-only helpers (middleware session check) live in `./session` and must
 * be imported from there directly, never through this barrel.
 */
export * from "./client";
export * from "./redirect";
export * from "./use-is-admin";
