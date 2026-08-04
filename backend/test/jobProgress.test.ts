import { describe, it, expect } from 'vitest';
import { computeJobProgress } from '../src/pipeline/jobProgress';

describe('computeJobProgress', () => {
  it('reports zero of zero for a freshly-queued job', () => {
    const progress = computeJobProgress({
      chunks: [],
      visionChunks: [],
      problems: [],
      chunkResults: [],
      problemResults: [],
    });
    expect(progress).toEqual({ done: 0, total: 0 });
  });

  it('counts text and vision chunks together', () => {
    const progress = computeJobProgress({
      chunks: [{}, {}, {}],
      visionChunks: [{}, {}],
      problems: [],
      chunkResults: [{}],
      problemResults: [],
    });
    expect(progress).toEqual({ done: 1, total: 5 });
  });

  it("grows its denominator once reduce populates `problems` — not a bug, the pipeline's total isn't known upfront", () => {
    const beforeSolving = computeJobProgress({
      chunks: [{}, {}],
      visionChunks: [],
      problems: [],
      chunkResults: [{}, {}],
      problemResults: [],
    });
    expect(beforeSolving).toEqual({ done: 2, total: 2 });

    const afterReduce = computeJobProgress({
      chunks: [{}, {}],
      visionChunks: [],
      problems: [{}, {}, {}],
      chunkResults: [{}, {}],
      problemResults: [],
    });
    expect(afterReduce).toEqual({ done: 2, total: 5 });
  });

  it('reaches done === total once every chunk and problem is recorded', () => {
    const progress = computeJobProgress({
      chunks: [{}, {}],
      visionChunks: [{}],
      problems: [{}, {}],
      chunkResults: [{}, {}, {}],
      problemResults: [{}, {}],
    });
    expect(progress.done).toBe(progress.total);
    expect(progress).toEqual({ done: 5, total: 5 });
  });
});
