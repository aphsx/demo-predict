"use server";

import { cookies } from "next/headers";

export async function setActiveRun(runId: number, runName: string) {
  const cookieStore = await cookies();
  cookieStore.set("active_run_id", String(runId), { path: "/", maxAge: 60 * 60 * 24 * 30 });
  cookieStore.set("active_run_name", runName, { path: "/", maxAge: 60 * 60 * 24 * 30 });
}
