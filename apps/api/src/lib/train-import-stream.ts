/**
 * Redis Stream progress for async train import (polled via GET /import/progress).
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

function fieldsToMap(fields: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < fields.length; i += 2) {
    map.set(fields[i], fields[i + 1]);
  }
  return map;
}

export type TrainImportStreamSnapshot =
  | { kind: "progress"; event: TrainPipelineProgressEvent }
  | { kind: "done"; result: TrainImportResult }
  | { kind: "failed"; message: string; code?: string; source_id?: string }
  | { kind: "empty" };

/** Latest Redis stream entry for GET /import/progress. */
export async function readLatestTrainImportStreamEntry(
  sourceId: string
): Promise<TrainImportStreamSnapshot> {
  const redis = redisClient();
  try {
    const entries = (await redis.xrevrange(
      trainImportStreamKey(sourceId),
      "+",
      "-",
      "COUNT",
      1
    )) as [string, string[]][];

    if (entries.length === 0) return { kind: "empty" };

    const fieldMap = fieldsToMap(entries[0][1]);
    const status = fieldMap.get("status");

    if (status === "done") {
      const payloadRaw = fieldMap.get("payload");
      const result = payloadRaw
        ? (JSON.parse(payloadRaw) as TrainImportResult)
        : ({ source_id: sourceId, import_status: "ready", sheet_manifest: {} } as TrainImportResult);
      return { kind: "done", result };
    }

    if (status === "failed") {
      return {
        kind: "failed",
        message: fieldMap.get("message") ?? fieldMap.get("step") ?? "Import failed",
        code: fieldMap.get("code"),
        source_id: fieldMap.get("source_id"),
      };
    }

    const phaseRaw = fieldMap.get("phase");
    return {
      kind: "progress",
      event: {
        progress: Number(fieldMap.get("progress") ?? "0"),
        step: fieldMap.get("step") ?? "",
        phase: phaseRaw === "clean" ? "clean" : "raw",
        sheet: fieldMap.get("sheet"),
        rows: fieldMap.get("rows") ? Number(fieldMap.get("rows")) : undefined,
      },
    };
  } finally {
    redis.disconnect();
  }
}
