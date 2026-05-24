"use client";
import { createAuthClient } from "better-auth/react";

// Auth now routes through the Next.js proxy (/api/auth/* → Elysia /api/auth/*).
// baseURL is omitted so Better Auth uses the same origin — no CORS, no extra env var.
// Override with NEXT_PUBLIC_AUTH_URL for non-local deployments (e.g. staging).
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL,
});

export const { signIn, signOut, useSession, getSession } = authClient;
