"use client";
import { createAuthClient } from "better-auth/react";

// NEXT_PUBLIC_AUTH_URL must point to the Elysia API service (not Next.js).
// Dev default: http://localhost:3002  Docker: set via env_file
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL || "http://localhost:3001",
});

export const { signIn, signOut, useSession, getSession } = authClient;
