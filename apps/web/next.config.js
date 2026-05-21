/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const elysiaUrl = process.env.ELYSIA_URL || "http://localhost:3002";
    const mlUrl = process.env.API_URL || "http://ml:8000";
    return [
      // Phase 4a — read-only prediction/summary routes now served by Elysia.
      // These paths are GET-only so redirecting all methods is safe.
      // More specific patterns must come before the catch-all.
      {
        source: "/api/runs/:id/predictions/:acc_id",
        destination: `${elysiaUrl}/runs/:id/predictions/:acc_id`,
      },
      {
        source: "/api/runs/:id/summary",
        destination: `${elysiaUrl}/runs/:id/summary`,
      },
      {
        source: "/api/runs/:id/predictions",
        destination: `${elysiaUrl}/runs/:id/predictions`,
      },
      // Phase 4c — /runs and /runs/:id fully migrated (GET + POST + DELETE).
      // These must come AFTER the more-specific sub-path rules above so that
      // /api/runs/:id/predictions, /summary, etc. still match first.
      {
        source: "/api/runs/:id",
        destination: `${elysiaUrl}/runs/:id`,
      },
      {
        source: "/api/runs",
        destination: `${elysiaUrl}/runs`,
      },
      // Phase 4b — training/admin routes now served by Elysia (all now require auth).
      // /model-versions/active must come before /model-versions to avoid path shadowing.
      // POST /model-versions/train still goes to FastAPI via catch-all (Python subprocess).
      {
        source: "/api/model-versions/active",
        destination: `${elysiaUrl}/model-versions/active`,
      },
      {
        source: "/api/model-versions",
        destination: `${elysiaUrl}/model-versions`,
      },
      {
        source: "/api/model-metrics",
        destination: `${elysiaUrl}/model-metrics`,
      },
      {
        source: "/api/training-log",
        destination: `${elysiaUrl}/training-log`,
      },
      // Everything else (including /api/runs, /api/runs/:id with POST/DELETE,
      // upload, stream, export, explain, POST /model-versions/train) still goes to FastAPI.
      {
        source: "/api/:path((?!auth(?:/|$)).*)",
        destination: `${mlUrl}/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { hostname: "lh3.googleusercontent.com" },
      { hostname: "avatars.githubusercontent.com" },
      { hostname: "cdn.discordapp.com" },
    ],
  },
};
module.exports = nextConfig;
