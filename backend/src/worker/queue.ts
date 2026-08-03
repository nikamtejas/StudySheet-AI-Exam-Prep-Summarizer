import { Queue } from 'bullmq';
import { getRedisConnection } from '../lib/redis';

export const SUMMARIZE_QUEUE_NAME = 'summarize';

export interface SummarizeJobData {
  // Mongo Job document id. The queue carries only this pointer — all real
  // state lives on the Job document itself (pipeline/orchestrate.ts), so
  // re-processing the same jobId is always safe to resume.
  jobId: string;
}

let queue: Queue<SummarizeJobData> | null = null;

export function getSummarizeQueue(): Queue<SummarizeJobData> {
  if (!queue) {
    queue = new Queue<SummarizeJobData>(SUMMARIZE_QUEUE_NAME, { connection: getRedisConnection() });
  }
  return queue;
}

export async function enqueueSummarizeJob(jobId: string): Promise<void> {
  await getSummarizeQueue().add(
    SUMMARIZE_QUEUE_NAME,
    { jobId },
    {
      // One BullMQ attempt — pipeline/orchestrate.ts's own stage-checkpoint
      // resumption is what makes retries safe, not BullMQ's retry counter.
      // A failed job stays in Redis (removeOnFail: false) so an operator can
      // requeue it after fixing whatever failed.
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}
