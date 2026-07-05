import { betterAuth } from "better-auth";
import { USER_PROFILE_FIELDS, USER_ROLE_FIELD } from "@moby/types";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL environment variable is not set");

const pool = new Pool({
  connectionString: databaseUrl,
});

/** Comma-separated origin list → trimmed array (defaults to local web + api). */
function parseTrustedOrigins(raw: string | undefined): string[] {
  return (raw ?? "http://localhost:3001,http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Maps the Google OAuth profile onto our extra user columns.
 * Default Google scopes (openid email profile) already return these — no
 * restricted scope / app verification needed, and any Google account is allowed
 * (no `hd` / domain restriction). `name`, `email`, `emailVerified` and `image`
 * (picture) are mapped by Better Auth itself.
 */
function googleProfileToUser(profile: {
  given_name?: string;
  family_name?: string;
  locale?: string;
}) {
  return {
    givenName: profile.given_name ?? null,
    familyName: profile.family_name ?? null,
    locale: profile.locale ?? null,
  };
}

export const auth = betterAuth({
  database: pool,
  // The public-facing URL for OAuth callbacks (should be the Next.js origin in dev).
  // Google Console redirect URI: ${BETTER_AUTH_URL}/api/auth/callback/google
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: parseTrustedOrigins(process.env.ALLOWED_ORIGINS),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      mapProfileToUser: googleProfileToUser,
    },
  },
  user: {
    // Extra columns populated from the Google profile + org role (single source: @moby/types).
    additionalFields: { ...USER_PROFILE_FIELDS, ...USER_ROLE_FIELD },
    // Allow users to delete their own account (cascades to session + account rows).
    deleteUser: { enabled: true },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    // Don't require a "fresh" session for sensitive ops (e.g. self-delete). Social-login
    // users have no password to re-confirm with, so a freshness gate would just block them.
    freshAge: 0,
  },
});
