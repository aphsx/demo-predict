import { cookies } from "next/headers";

export async function getActiveRunId(): Promise<number | null> {
  const cookieStore = await cookies();
  const val = cookieStore.get("active_run_id")?.value;
  return val ? parseInt(val, 10) : null;
}

export async function getActiveRunName(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("active_run_name")?.value ?? null;
}
