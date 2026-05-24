const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
  async rewrites() {
    const elysiaUrl = process.env.ELYSIA_URL || "http://api:3001";
    return [
      // Auth routes: preserve the /api prefix so Better Auth receives /api/auth/*
      {
        source: "/api/auth/:path*",
        destination: `${elysiaUrl}/api/auth/:path*`,
      },
      // All other API routes: strip /api prefix (Elysia routes live at /, not /api/)
      {
        source: "/api/:path*",
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
