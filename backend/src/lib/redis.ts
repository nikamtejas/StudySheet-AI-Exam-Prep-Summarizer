import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';
import { describeError } from './errors';
import type { HealthCheckResult } from '../contracts';

let client: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!client) {
    // BullMQ requires this to be null so it can manage retries/blocking commands itself.
    client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
    // ioredis retries forever in the background and emits 'error' on every failed
    // attempt. Without a listener those go to the console unstructured; route them
    // through the real logger instead. checkRedis() below still reports the
    // current state on each /health call regardless of this stream.
    client.on('error', (err) => {
      logger.warn({ err: describeError(err) }, 'redis connection error');
    });
  }
  return client;
}

const CHECK_TIMEOUT_MS = 2000;

export async function checkRedis(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await Promise.race([
      getRedisConnection().ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('redis ping timed out')), CHECK_TIMEOUT_MS),
      ),
    ]);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: describeError(err) };
  }
}
