/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Phase 5: all API routes are in Elysia. Single catch-all replaces 13 per-route rules.
    // /api/auth/* is excluded because Next.js still hosts the (now-dead) auth route handler
    // until Phase 7 cleanup removes it.
    const elysiaUrl = process.env.ELYSIA_URL || "http://api:3001";
    return [
      {
        source: "/api/:path((?!auth(?:/|$)).*)",
        destination: `${elysiaUrl}/:path*`,
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
