import { Router, type Response } from 'express';
import mongoose from 'mongoose';
import { CreateJobRequestSchema } from '../../contracts';
import { DocumentModel } from '../../models/Document';
import { JobModel, type JobInstance } from '../../models/Job';
import { enqueueSummarizeJob } from '../../worker/queue';
import { computeJobProgress } from '../../pipeline/jobProgress';
import { computeSseSnapshot, snapshotChanged, isTerminal } from '../../pipeline/sseSnapshot';
import { asyncHandler } from '../asyncHandler';
import type { JobDTO } from '../../contracts';

export const jobsRouter = Router();

function toJobDTO(job: JobInstance): JobDTO {
  return {
    id: job.id,
    userId: job.userId,
    documentIds: job.documentIds,
    status: job.status,
    stage: job.stage,
    progress: computeJobProgress(job),
    tokensUsed: job.tokensUsed,
    costCents: job.costCents,
    summaryId: job.summaryId,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
  };
}

// docs/studysheet-build-prompt.md §10: "POST /api/jobs → { documentIds,
// config } → { jobId }". Submission itself must stay well under the 400ms
// budget (§11) — this route only validates, persists, and enqueues; every
// AI-touching step happens in the worker (reliability invariant 1).
jobsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = CreateJobRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', details: parsed.error.issues });
      return;
    }

    const { documentIds, depth, language, userId } = parsed.data;

    for (const documentId of documentIds) {
      if (!mongoose.Types.ObjectId.isValid(documentId)) {
        res.status(400).json({ error: 'invalid_document_id', documentId });
        return;
      }
    }

    const foundCount = await DocumentModel.countDocuments({ _id: { $in: documentIds }, userId });
    if (foundCount !== documentIds.length) {
      res.status(404).json({ error: 'document_not_found' });
      return;
    }

    const job = await JobModel.create({
      userId,
      documentIds,
      status: 'queued',
      stage: 'queued',
      config: { depth, language },
    });

    try {
      // BullMQ's queue connection is deliberately configured with
      // maxRetriesPerRequest: null (lib/redis.ts) so transient Redis blips
      // don't randomly fail a real enqueue — but that also means a genuinely
      // down Redis makes this call hang forever, not fail fast. Bounded here
      // so a Redis outage produces a clean 503 within the submit budget
      // (§11) instead of an indefinitely-hanging request. Racing a timeout
      // stops this handler from waiting, but doesn't cancel the underlying
      // ioredis retry loop — if Redis recovers moments later, the enqueue
      // could still succeed against a Job we've already deleted, and the
      // worker would then fail that BullMQ entry with "not found". Rare and
      // harmless (no data corruption, just one noisy failed-queue entry);
      // fully solving it would mean tearing into ioredis's retry internals,
      // not worth it for this.
      await Promise.race([
        enqueueSummarizeJob(job.id),
        new Promise((_, reject) => setTimeout(() => reject(new Error('queue enqueue timed out')), 3000)),
      ]);
    } catch (err) {
      await JobModel.findByIdAndDelete(job.id);
      req.log?.error({ err }, 'failed to enqueue job — queue unreachable');
      res.status(503).json({ error: 'queue_unavailable' });
      return;
    }

    res.status(201).json({ jobId: job.id });
  }),
);

// docs/studysheet-build-prompt.md §10: "GET /api/jobs/:id → status snapshot".
jobsRouter.get(
  '/:jobId',
  asyncHandler(async (req, res) => {
    const jobId = req.params.jobId;
    if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const job = await JobModel.findById(jobId);
    if (!job) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    res.json(toJobDTO(job));
  }),
);

const POLL_INTERVAL_MS = 500;
const HEARTBEAT_INTERVAL_MS = 15000;

function sseWrite(res: Response, id: number, event: string, data: unknown): void {
  res.write(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// docs/studysheet-build-prompt.md §10: "GET /api/jobs/:id/stream → SSE:
// stage, progress, partial sections". Polls the persisted Job document
// rather than subscribing to any in-process/pub-sub event source — the
// worker (a separate process) is the only thing that ever advances a job,
// and it already checkpoints every stage to Mongo (reliability invariants
// 2/6), so Mongo is already the single source of truth for "how far along is
// this job" regardless of which process asks. That's also what makes
// reconnection trivial and duplicate-free (docs/studysheet-milestones.md M7:
// "SSE survives a 30-second network drop... resumes without duplicate
// sections", "refreshing mid-job reconnects... rather than restarting it"):
// a fresh connection just starts polling from the job's current state and
// reports forward — there's no history to replay, so there's nothing to
// duplicate.
jobsRouter.get(
  '/:jobId/stream',
  asyncHandler(async (req, res) => {
    const jobId = req.params.jobId;
    if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) {
      res.status(404).end();
      return;
    }

    const initial = await JobModel.findById(jobId);
    if (!initial) {
      res.status(404).end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disables response buffering on nginx-fronted deployments — without
      // this, events can sit in a proxy buffer instead of reaching the
      // client promptly.
      'X-Accel-Buffering': 'no',
    });

    let eventId = 0;
    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    const heartbeat = setInterval(() => {
      if (!closed) res.write(': heartbeat\n\n');
    }, HEARTBEAT_INTERVAL_MS);

    let lastSnapshot: ReturnType<typeof computeSseSnapshot> | null = null;
    try {
      while (!closed) {
        const job = await JobModel.findById(jobId);
        if (!job) break;

        const snapshot = computeSseSnapshot(job);

        if (snapshotChanged(snapshot, lastSnapshot)) {
          eventId += 1;
          sseWrite(res, eventId, 'progress', snapshot);
          lastSnapshot = snapshot;
        }

        if (isTerminal(job.status)) {
          eventId += 1;
          sseWrite(res, eventId, 'done', {
            status: job.status,
            summaryId: job.summaryId,
            error: job.error,
          });
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }),
);
