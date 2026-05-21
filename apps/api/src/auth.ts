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
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
});
