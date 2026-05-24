import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { auth } from "./auth";
import { runsRoutes } from "./routes/runs";
import { predictionsRoutes } from "./routes/predictions";
import { trainingRoutes } from "./routes/training";
import { uploadsRoutes } from "./routes/uploads";
import { explanationsRoutes } from "./routes/explanations";
import { eventsRoutes } from "./routes/events";
import { insightsRoutes } from "./routes/insights";
// [NEW] Train raw Excel import — greenfield; not tied to prediction_runs (see docs/DATA-PIPELINE-MIGRATION.md)
import { trainDataRoutes } from "./routes/train-data";

const PORT      = Number(process.env.PORT ?? 3001);
const MODEL_DIR = process.env.MODEL_DIR ?? "/app/models";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = new Elysia()
  .use(
    cors({
      origin: ALLOWED_ORIGINS,
      credentials: true,
    })
  )
  // Better Auth handles all /api/auth/* routes; returns null for everything else
  .mount(auth.handler)
  // [LEGACY] Predict/inference — prediction_runs, raw_*, predictions, Arq worker
  .use(runsRoutes)
  .use(predictionsRoutes)
  // [LEGACY] Model artifact registry + POST /model-versions/train (FastAPI subprocess)
  .use(trainingRoutes)
  // [LEGACY] Excel upload per run → raw_* + enqueue pipeline (/runs page)
  .use(uploadsRoutes)
  // Phase 4e routes (SHAP explain — proxied to FastAPI /internal/explain)
  .use(explanationsRoutes)
  // Phase 4g routes (SSE — Redis Streams XREAD with DB fallback)
  .use(eventsRoutes)
  // Phase 2 — LLM insights (Gemini)
  .use(insightsRoutes)
  // [NEW] Train raw import → train_data_sources + train_raw_sheet_* (/training page)
  .use(trainDataRoutes)
  .get("/health", () => {
    const churn      = existsSync(join(MODEL_DIR, "churn_model.pkl"));
    const winback    = existsSync(join(MODEL_DIR, "winback_model.pkl"));
    const conversion = existsSync(join(MODEL_DIR, "conversion_model.pkl"));
    const allOk      = churn && winback && conversion;
    return {
      status:  allOk ? "ok" : "degraded",
      db:      "connected",
      models:  { churn, winback, conversion },
      message: allOk ? null : "Models not trained — run: python train.py <data_file>",
    };
  })
  .listen(PORT);

console.log(`[api] Elysia listening on port ${PORT}`);

export type App = typeof app;
