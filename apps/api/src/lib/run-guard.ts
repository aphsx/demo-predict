import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { predictionRuns } from "../db/schema";

type GuardOk = { ok: true; runId: string };
type GuardFail = { ok: false; status: 404 | 403; message: string };

/**
 * Verify the run exists and belongs to the given user.
 * Fixes the FastAPI NULL-bypass bug: a run with no owner is inaccessible.
 */
export async function verifyRunOwnership(
  runId: string,
  userId: string
): Promise<GuardOk | GuardFail> {
  const [run] = await db
    .select({ id: predictionRuns.id, userId: predictionRuns.userId })
    .from(predictionRuns)
    .where(eq(predictionRuns.id, runId))
    .limit(1);

  if (!run) return { ok: false, status: 404, message: "Run not found" };
  if (run.userId !== userId) return { ok: false, status: 403, message: "Not your run" };
  return { ok: true, runId: run.id };
}
