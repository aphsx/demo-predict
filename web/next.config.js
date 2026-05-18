/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path((?!auth(?:/|$)).*)",
        destination: `${process.env.API_URL || "http://ml:8000"}/:path*`,
      },
    ];
  },
};
module.exports = nextConfig;
