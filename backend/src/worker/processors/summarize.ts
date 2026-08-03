import { Worker, type Job } from 'bullmq';
import { getRedisConnection } from '../../lib/redis';
import { processJob } from '../../pipeline/orchestrate';
import { logger } from '../../lib/logger';
import { env } from '../../config/env';
import { SUMMARIZE_QUEUE_NAME, type SummarizeJobData } from '../queue';

export function createSummarizeWorker(): Worker<SummarizeJobData> {
  const worker = new Worker<SummarizeJobData>(
    SUMMARIZE_QUEUE_NAME,
    async (job: Job<SummarizeJobData>) => {
      const log = logger.child({ jobId: job.data.jobId, bullJobId: job.id });
      log.info('summarize job picked up');
      await processJob(job.data.jobId);
      log.info('summarize job finished');
    },
    { connection: getRedisConnection(), concurrency: env.WORKER_CONCURRENCY },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.data.jobId, bullJobId: job?.id, err }, 'summarize job failed');
  });

  return worker;
}
