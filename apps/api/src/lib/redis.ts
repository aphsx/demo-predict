import IORedis from "ioredis";

const host = process.env.REDIS_HOST || "redis";
const port = Number(process.env.REDIS_PORT ?? 6379);

export const redis = new IORedis(port, host, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
