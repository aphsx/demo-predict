/**
 * One-off dev seed: import the example Excel as both a train data source and
 * a predict data source, running the same raw-import + clean pipeline the
 * API routes use. Usage:
 *
 *   DATABASE_URL=... bun run apps/api/scripts/seed-import.ts <path-to-xlsx>
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, sqlClient } from "../src/db/client";
import { importTrainExcel } from "../src/lib/train-import";
import { cleanTrainFromRaw } from "../src/lib/train-clean";
import { importPredictExcel } from "../src/lib/predict-import";
import { cleanPredictFromRaw } from "../src/lib/predict-clean";

const DEV_USER_ID = "dev-user-local";

async function ensureDevUser(): Promise<void> {
  await db.execute(sql`
    INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    VALUES (${DEV_USER_ID}, 'Dev User', 'dev@local.test', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: bun run seed-import.ts <path-to-xlsx>");
  const buffer = readFileSync(path);

  await ensureDevUser();

  console.log("[seed] importing train raw…");
  const train = await importTrainExcel({
    buffer,
    filename: "seed.xlsx",
    name: "1Moby example (train)",
    imported_by: DEV_USER_ID,
    deferReadyCatalog: true,
  });
  console.log("[seed] train raw manifest:", train.sheet_manifest);
  const trainClean = await cleanTrainFromRaw(train.source_id, (e) =>
    console.log(`[seed]   clean ${e.progress}% ${e.step}`)
  );
  console.log("[seed] train source ready:", train.source_id, JSON.stringify(trainClean).slice(0, 200));

  console.log("[seed] importing predict raw…");
  const predict = await importPredictExcel({
    buffer,
    filename: "seed.xlsx",
    name: "1Moby example (predict)",
    imported_by: DEV_USER_ID,
    deferReadyCatalog: true,
  });
  console.log("[seed] predict raw manifest:", predict.sheet_manifest);
  const predictClean = await cleanPredictFromRaw(predict.source_id);
  console.log("[seed] predict source ready:", predict.source_id, JSON.stringify(predictClean).slice(0, 200));

  await sqlClient.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
