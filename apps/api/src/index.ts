import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { auth } from "./auth";
import { trainDataRoutes } from "./routes/train-data";
import { predictDataRoutes } from "./routes/predict-data";

const PORT = Number(process.env.PORT ?? 3001);

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
  // Train raw import -> train_data_sources + train_raw_sheet_* + train_clean_*
  .use(trainDataRoutes)
  // Predict raw import -> predict_data_sources + predict_raw_sheet_* + predict_clean_*
  .use(predictDataRoutes)
  .get("/health", () => {
    return {
      status: "ok",
      db: "connected",
      message: "Legacy ML runtime removed; ML v2 training pipeline is being rebuilt.",
    };
  })
  .listen(PORT);

console.log(`[api] Elysia listening on port ${PORT}`);

export type App = typeof app;
