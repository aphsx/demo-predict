/**
 * Redis Streams progress for async train import (GET SSE — not buffered like POST stream).
 */
import IORedis from "ioredis";
import type { TrainImportResult } from "./train-import";
import type { TrainPipelineProgressEvent } from "./train-pipeline-progress";

const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379);
const STREAM_TTL_SEC = 3600;

export function trainImportStreamKey(sourceId: string): string {
  return `train-import:${sourceId}`;
}

function redisClient(): IORedis {
  return new IORedis(REDIS_PORT, REDIS_HOST, {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
  });
}

export async function publishTrainPipelineProgress(
  sourceId: string,
  event: TrainPipelineProgressEvent
): Promise<void> {
  const redis = redisClient();
  try {
    const fields: string[] = [
      "progress", String(event.progress),
      "step", event.step,
      "phase", event.phase,
    ];
    if (event.sheet) fields.push("sheet", event.sheet);
    if (event.rows != null) fields.push("rows", String(event.rows));
    await redis.xadd(trainImportStreamKey(sourceId), "*", ...fields);
    await redis.expire(trainImportStreamKey(sourceId), STREAM_TTL_SEC);
  } finally {
    redis.disconnect();
  }
}

export async function publishTrainImportDone(
  sourceId: string,
  result: TrainImportResult
): Promise<void> {
  const redis = redisClient();
  try {
    await redis.xadd(
      trainImportStreamKey(sourceId),
      "*",
      "progress", "100",
      "step", "Ready for model training",
      "status", "done",
      "payload", JSON.stringify(result)
    );
    await redis.expire(trainImportStreamKey(sourceId), STREAM_TTL_SEC);
  } finally {
    redis.disconnect();
  }
}

export async function publishTrainImportError(
  sourceId: string,
  message: string,
  extra?: { code?: string; source_id?: string }
): Promise<void> {
  const redis = redisClient();
  try {
    const fields: string[] = ["progress", "0", "step", `failed: ${message}`, "status", "failed", "message", message];
    if (extra?.code) fields.push("code", extra.code);
    if (extra?.source_id) fields.push("source_id", extra.source_id);
    await redis.xadd(trainImportStreamKey(sourceId), "*", ...fields);
    await redis.expire(trainImportStreamKey(sourceId), STREAM_TTL_SEC);
  } finally {
    redis.disconnect();
  }
}
