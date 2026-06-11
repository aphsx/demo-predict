/**
 * Roll back a failed import — delete catalog row (CASCADE raw + clean).
 */
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "../db/client";
import { predictDataSources, trainDataSources } from "../db/schema";

const STALE_IMPORT_MINUTES = 15;

export async function abortTrainDataSource(sourceId: string): Promise<void> {
  await db.delete(trainDataSources).where(eq(trainDataSources.id, sourceId));
}

export async function abortPredictDataSource(sourceId: string): Promise<void> {
  await db.delete(predictDataSources).where(eq(predictDataSources.id, sourceId));
}

/** Remove catalogs left in importing/cleaning after server/docker stopped. */
export async function releaseStaleTrainImports(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_IMPORT_MINUTES * 60 * 1000);
  const stale = await db
    .select({ id: trainDataSources.id })
    .from(trainDataSources)
    .where(
      and(
        inArray(trainDataSources.importStatus, ["importing", "cleaning"]),
        isNull(trainDataSources.cleanedAt),
        lt(trainDataSources.createdAt, cutoff)
      )
    );

  for (const row of stale) {
    await abortTrainDataSource(row.id);
  }
  return stale.length;
}
