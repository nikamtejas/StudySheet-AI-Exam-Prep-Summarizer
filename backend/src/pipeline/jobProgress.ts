import type { JobProgress } from '../contracts';

// Only the array lengths matter — a narrow shape (not the full JobInstance)
// keeps this a pure, dependency-free function to unit test directly, the
// same pattern as pipeline/highlightCap.ts.
export interface JobProgressCounts {
  chunks: unknown[];
  visionChunks: unknown[];
  problems: unknown[];
  chunkResults: unknown[];
  problemResults: unknown[];
}

// "done" counts every checkpointed unit of work across the two resumable
// stages that actually take time (mapping, solving) — chunks (text +
// vision) plus problems. Before solving starts, `problems` is empty, so the
// denominator grows once reduce populates it; that's expected, not a bug —
// progress for a pipeline whose total isn't known until partway through is
// inherently like this, and it's still monotonically non-decreasing.
export function computeJobProgress(job: JobProgressCounts): JobProgress {
  const total = job.chunks.length + job.visionChunks.length + job.problems.length;
  const done = job.chunkResults.length + job.problemResults.length;
  return { done, total };
}
