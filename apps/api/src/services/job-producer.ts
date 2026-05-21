/**
 * Enqueues a job in the Arq Redis queue.
 *
 * Arq's wire format (arq>=0.25, default msgpack serializer):
 *   key  arq:job:{job_id}        → msgpack({f, a, kw, t, et})
 *   zadd arq:queue {score_ms}    → job_id member
 *
 * job_id is a UUID with dashes stripped (matches Python's uuid4().hex).
 * score and et are milliseconds since Unix epoch (matching Arq's enqueue_time_ms).
 */
import { encode } from "@msgpack/msgpack";
import { redis } from "../lib/redis";

const ARQ_QUEUE = "arq:queue";
const ARQ_JOB_PREFIX = "arq:job:";

export async function enqueueArqJob(
  functionName: string,
  ...args: unknown[]
): Promise<string> {
  const jobId = crypto.randomUUID().replace(/-/g, ""); // matches uuid4().hex
  const nowMs = Date.now();

  const payload = encode({
    f: functionName,
    a: args,
    kw: {},
    t: null,
    et: nowMs,
  });

  const pipeline = redis.pipeline();
  pipeline.setnx(`${ARQ_JOB_PREFIX}${jobId}`, Buffer.from(payload));
  pipeline.zadd(ARQ_QUEUE, nowMs, jobId);
  await pipeline.exec();

  return jobId;
}
