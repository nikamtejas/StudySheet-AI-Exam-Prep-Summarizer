import express from 'express';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { getHealthStatus } from '../lib/health';
import { createSummarizeWorker } from './processors/summarize';

// The health server must come up even if Mongo/Redis/storage are unreachable —
// that's precisely the situation the probe needs to report. Connections to
// each dependency are established lazily, on the first /health check that
// needs them (see lib/mongo.ts, lib/redis.ts, lib/storage.ts), not blocked on
// here. BullMQ's Worker behaves the same way — it retries its Redis
// connection in the background rather than throwing at construction time.
function main(): void {
  const app = express();
  app.get('/health', async (_req, res) => {
    const status = await getHealthStatus('worker');
    res.status(status.ok ? 200 : 503).json(status);
  });

  app.listen(env.WORKER_HEALTH_PORT, () => {
    logger.info({ port: env.WORKER_HEALTH_PORT }, 'Worker health server listening');
  });

  createSummarizeWorker();
  logger.info('Worker started, consuming the summarize queue');
}

main();

