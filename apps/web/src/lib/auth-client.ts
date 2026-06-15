"use client";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

// Auth now routes through the Next.js proxy (/api/auth/* → Elysia /api/auth/*).
// baseURL is omitted so Better Auth uses the same origin — no CORS, no extra env var.
// Override with NEXT_PUBLIC_AUTH_URL for non-local deployments (e.g. staging).
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL,
  plugins: [
    // Mirror the server's user.additionalFields so session.user is typed with these.
    inferAdditionalFields({
      user: {
        givenName: { type: "string", required: false },
        familyName: { type: "string", required: false },
        locale: { type: "string", required: false },
      },
    }),
  ],
});

export const { signIn, signOut, useSession, getSession, updateUser, deleteUser } = authClient;
