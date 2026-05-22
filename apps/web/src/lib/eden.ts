"use client";

import { treaty } from "@elysiajs/eden";
import type { App } from "@moby/api";

// Route through the Next.js proxy instead of calling Elysia directly.
// next.config.js rewrites /api/:path* → Elysia /:path* (strips the /api prefix).
// This keeps requests same-origin so the Better Auth session cookie is always sent.
// NEXT_PUBLIC_AUTH_URL is already set to the Next.js origin (e.g. http://localhost:3000).
const BASE = `${process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3000"}/api` as string;

export const elysia = treaty<App>(BASE, {
  fetch: { credentials: "include" },
  onResponse(response) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    }
    return response;
  },
});
