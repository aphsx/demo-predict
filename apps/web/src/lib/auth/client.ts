"use client";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { USER_PROFILE_FIELDS } from "@moby/types";

// Auth routes through the Next.js proxy (/api/auth/* → Elysia /api/auth/*).
// baseURL is omitted so Better Auth uses the same origin — no CORS, no extra env var.
// Override with NEXT_PUBLIC_AUTH_URL for non-local deployments (e.g. staging).
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL,
  plugins: [
    // Mirror the server's user.additionalFields (single source: @moby/types) so
    // session.user is typed with givenName / familyName / locale.
    inferAdditionalFields({ user: USER_PROFILE_FIELDS }),
  ],
});

export const { signIn, signOut, useSession, getSession, updateUser, deleteUser } = authClient;
