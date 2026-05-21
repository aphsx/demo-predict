import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";

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
  .get("/health", () => ({ ok: true, service: "api" }))
  .listen(PORT);

console.log(`[api] Elysia listening on port ${PORT}`);

export type App = typeof app;
