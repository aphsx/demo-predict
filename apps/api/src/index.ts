import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { auth } from "./auth";
import { runsRoutes } from "./routes/runs";
import { predictionsRoutes } from "./routes/predictions";
import { trainingRoutes } from "./routes/training";
import { uploadsRoutes } from "./routes/uploads";
import { explanationsRoutes } from "./routes/explanations";

const PORT = Number(process.env.PORT ?? 3002);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3001,http://localhost:3000")
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
  // Phase 4a routes (read-only)
  .use(runsRoutes)
  .use(predictionsRoutes)
  // Phase 4b routes (training/admin — all now require auth)
  .use(trainingRoutes)
  // Phase 4d routes (Excel upload + Arq enqueue)
  .use(uploadsRoutes)
  // Phase 4e routes (SHAP explain — proxied to FastAPI /internal/explain)
  .use(explanationsRoutes)
  .get("/health", () => ({ ok: true, service: "api" }))
  .listen(PORT);

console.log(`[api] Elysia listening on port ${PORT}`);

export type App = typeof app;
