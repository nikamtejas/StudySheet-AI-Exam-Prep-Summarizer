import { computeJobProgress, type JobProgressCounts } from './jobProgress';
import type { JobProgress } from '../contracts';

export interface SseProgressSnapshot {
  stage: string;
  status: string;
  progress: JobProgress;
  tokensUsed: { input: number; output: number };
  costCents: number;
  // docs/studysheet-milestones.md M11 — surfaced live so a client watching
  // the processing view sees "retrying automatically" during an AI-service
  // outage, not just a stalled progress bar (pipeline/orchestrate.ts sets
  // this on Job, never on a terminal failure).
  statusMessage: string | null;
}

export interface SseJobFields extends JobProgressCounts {
  stage: string;
  status: string;
  tokensUsed: { input: number; output: number };
  costCents: number;
  statusMessage: string | null;
}

export function computeSseSnapshot(job: SseJobFields): SseProgressSnapshot {
  return {
    stage: job.stage,
    status: job.status,
    progress: computeJobProgress(job),
    tokensUsed: job.tokensUsed,
    costCents: job.costCents,
    statusMessage: job.statusMessage,
  };
}

// A fresh connection (reconnect after a dropped network, or a page refresh
// mid-job) has no prior snapshot, and must emit the job's current state as
// its first event rather than waiting for the next change — otherwise a
// client that reconnects mid-job would sit on a stale UI until the job
// happens to advance. docs/studysheet-milestones.md M7: "SSE survives a
// 30-second network drop and resumes without duplicate sections" — "without
// duplicates" means deduped by content across the life of one connection,
// not that a reconnect's own first frame gets skipped.
export function snapshotChanged(current: SseProgressSnapshot, previous: SseProgressSnapshot | null): boolean {
  if (previous === null) return true;
  return JSON.stringify(current) !== JSON.stringify(previous);
}

export function isTerminal(status: string): boolean {
  return status === 'completed' || status === 'failed';
}
