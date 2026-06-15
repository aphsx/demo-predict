import { betterAuth } from "better-auth";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const auth = betterAuth({
  database: pool,
  // The public-facing URL for OAuth callbacks (should be the Next.js origin in dev).
  // Google Console redirect URI: ${BETTER_AUTH_URL}/api/auth/callback/google
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:3001,http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // Default Google scopes (openid email profile) already return these fields —
      // no restricted scope / app verification required. Any Google account is allowed
      // (no `hd` / domain restriction). Map the basic profile into our user record.
      mapProfileToUser: (profile) => ({
        givenName: profile.given_name ?? null,
        familyName: profile.family_name ?? null,
        locale: profile.locale ?? null,
        // `name`, `email`, `emailVerified` and `image` (picture) are mapped by Better Auth.
      }),
    },
  },
  user: {
    // Extra columns populated from the Google profile. `input: false` keeps them
    // read-only from the client — they can only be set via the OAuth mapping above.
    additionalFields: {
      givenName: { type: "string", required: false, input: false },
      familyName: { type: "string", required: false, input: false },
      locale: { type: "string", required: false, input: false },
    },
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
