import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from './logger';
import { describeError } from './errors';
import type { HealthCheckResult } from '../contracts';

let connectPromise: Promise<typeof mongoose> | null = null;

export function getMongoConnection(): Promise<typeof mongoose> {
  if (!connectPromise) {
    connectPromise = mongoose
      .connect(env.MONGODB_URI)
      .then((conn) => {
        logger.info('Connected to MongoDB');
        return conn;
      })
      .catch((err) => {
        // Don't cache a failed attempt — the next health check (or caller)
        // should retry rather than stay stuck once Mongo comes back up.
        connectPromise = null;
        throw err;
      });
  }
  return connectPromise;
}

const CHECK_TIMEOUT_MS = 2000;

export async function checkMongo(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await Promise.race([
      getMongoConnection().then((conn) => conn.connection.db?.admin().ping()),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('mongo ping timed out')), CHECK_TIMEOUT_MS),
      ),
    ]);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: describeError(err) };
  }
}
