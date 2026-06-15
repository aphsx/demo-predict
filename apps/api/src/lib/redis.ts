import IORedis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379);

let _client: IORedis | null = null;

export function getRedis(): IORedis {
  if (!_client || _client.status === "end") {
    _client = new IORedis(REDIS_PORT, REDIS_HOST, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
    });
  }
  return _client;
}
