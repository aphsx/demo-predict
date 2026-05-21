"use client";

import { treaty } from "@elysiajs/eden";
import type { App } from "@moby/api";

// Direct to Elysia — same pattern as the auth client pre-cleanup.
// NEXT_PUBLIC_API_URL defaults to localhost:3001 for local dev.
// For Docker: both are on the same host so localhost:3001 is reachable from the browser.
const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") as string;

export const elysia = treaty<App>(BASE, {
  fetch: { credentials: "include" },
  onResponse(response) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    }
    return response;
  },
});
