import Elysia, { t } from "elysia";
import { asc, desc, eq, sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../db/client";
import { modelVersions } from "../db/schema";
import { requireUser } from "../lib/auth-middleware";

const MODEL_DIR   = process.env.MODEL_DIR ?? "/app/models";
const ML_URL      = process.env.ML_INTERNAL_URL || "http://ml:8000";
const INT_TOKEN   = process.env.INTERNAL_SERVICE_TOKEN || "";

// Explicit snake_case select — matches FastAPI response shape
const MODEL_VERSION_SELECT = {
  id: modelVersions.id,
  model_type: modelVersions.modelType,
  version: modelVersions.version,
  trained_at: modelVersions.trainedAt,
  metrics_json: modelVersions.metricsJson,
  model_file_path: modelVersions.modelFilePath,
  is_active: modelVersions.isActive,
} as const;

export const trainingRoutes = new Elysia()
  .use(requireUser)

  // GET /model-metrics — was unauthenticated in FastAPI; now requires auth
  .get("/model-metrics", async ({ set }) => {
    try {
      const content = await readFile(join(MODEL_DIR, "metrics.json"), "utf-8");
      return JSON.parse(content) as unknown;
    } catch {
      set.status = 404;
      return { message: "No metrics found — train models first" };
    }
  })

  // GET /training-log — was unauthenticated in FastAPI; now requires auth
  .get("/training-log", async ({ set }) => {
    try {
      const log = await readFile(join(MODEL_DIR, "training_log.txt"), "utf-8");
      return { log };
    } catch {
      set.status = 404;
      return { message: "No training log found — train models first" };
    }
  })

  // GET /model-versions/active — register before /model-versions to avoid ambiguity
  // Was unauthenticated in FastAPI; now requires auth
  .get("/model-versions/active", async () => {
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (model_type)
             id, model_type, version, trained_at,
             metrics_json, model_file_path, is_active
      FROM model_versions
      WHERE is_active = TRUE
      ORDER BY model_type, trained_at DESC
    `);
    return [...rows];
  })

  // GET /model-versions — was unauthenticated in FastAPI; now requires auth
  .get(
    "/model-versions",
    ({ query }) => {
      if (query.model_type) {
        return db
          .select(MODEL_VERSION_SELECT)
          .from(modelVersions)
          .where(eq(modelVersions.modelType, query.model_type))
          .orderBy(desc(modelVersions.trainedAt));
      }
      return db
        .select(MODEL_VERSION_SELECT)
        .from(modelVersions)
        .orderBy(asc(modelVersions.modelType), desc(modelVersions.trainedAt));
    },
    { query: t.Object({ model_type: t.Optional(t.String()) }) }
  )

  // POST /model-versions/train — proxied to FastAPI /internal/train (Python subprocess)
  // Body: { cutoff_date?: "YYYY-MM-DD" }  — omit to use TRAIN_CUTOFF_DATE env var
  .post(
    "/model-versions/train",
    async ({ body, set }) => {
      let res: Response;
      try {
        res = await fetch(`${ML_URL}/internal/train`, {
          method: "POST",
          headers: {
            "x-internal-token": INT_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cutoff_date: body.cutoff_date ?? null }),
        });
      } catch (err) {
        set.status = 502;
        const msg = err instanceof Error ? err.message : String(err);
        return { message: `ML service unavailable: ${msg}` };
      }
      if (!res.ok) {
        set.status = res.status;
        return res.json().catch(() => ({ message: "Train request failed" }));
      }
      return res.json();
    },
    {
      body: t.Object({ cutoff_date: t.Optional(t.String()) }),
    }
  );
