import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { trainDataSources } from "../db/schema";

type GuardOk = { ok: true; sourceId: string };
type GuardFail = { ok: false; status: 404 | 403; message: string };

/**
 * [NEW] Train import ownership — same pattern as verifyRunOwnership for prediction_runs.
 */
export async function verifyTrainSourceOwnership(
  sourceId: string,
  userId: string
): Promise<GuardOk | GuardFail> {
  const [row] = await db
    .select({
      id: trainDataSources.id,
      importedBy: trainDataSources.importedBy,
    })
    .from(trainDataSources)
    .where(eq(trainDataSources.id, sourceId))
    .limit(1);

  if (!row) return { ok: false, status: 404, message: "Train data source not found" };
  if (!row.importedBy || row.importedBy !== userId) {
    return { ok: false, status: 403, message: "Not your import" };
  }
  return { ok: true, sourceId: row.id };
}
