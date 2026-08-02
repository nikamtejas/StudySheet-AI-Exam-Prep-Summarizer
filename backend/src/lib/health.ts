import { checkMongo } from './mongo';
import { checkRedis } from './redis';
import { checkStorage } from './storage';
import type { HealthStatus } from '../contracts';

export async function getHealthStatus(service: HealthStatus['service']): Promise<HealthStatus> {
  const [mongo, redis, storage] = await Promise.all([checkMongo(), checkRedis(), checkStorage()]);
  return {
    ok: mongo.ok && redis.ok && storage.ok,
    service,
    checks: { mongo, redis, storage },
    timestamp: new Date().toISOString(),
  };
}
