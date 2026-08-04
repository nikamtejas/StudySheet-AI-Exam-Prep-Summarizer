import { describe, it, expect } from 'vitest';
import { computeSseSnapshot, snapshotChanged, isTerminal, type SseJobFields } from '../src/pipeline/sseSnapshot';

function job(overrides: Partial<SseJobFields> = {}): SseJobFields {
  return {
    stage: 'chunking',
    status: 'processing',
    tokensUsed: { input: 0, output: 0 },
    costCents: 0,
    chunks: [],
    visionChunks: [],
    problems: [],
    chunkResults: [],
    problemResults: [],
    ...overrides,
  };
}

describe('sseSnapshot', () => {
  it('emits on a fresh connection even though nothing has changed yet — reconnect must not wait for the next real change', () => {
    const snapshot = computeSseSnapshot(job());
    expect(snapshotChanged(snapshot, null)).toBe(true);
  });

  it('does not re-emit an identical snapshot on the next poll', () => {
    const a = computeSseSnapshot(job({ stage: 'mapping', chunks: [{}, {}], chunkResults: [{}] }));
    const b = computeSseSnapshot(job({ stage: 'mapping', chunks: [{}, {}], chunkResults: [{}] }));
    expect(snapshotChanged(b, a)).toBe(false);
  });

  it('emits again once progress actually advances', () => {
    const before = computeSseSnapshot(job({ stage: 'mapping', chunks: [{}, {}], chunkResults: [{}] }));
    const after = computeSseSnapshot(job({ stage: 'mapping', chunks: [{}, {}], chunkResults: [{}, {}] }));
    expect(snapshotChanged(after, before)).toBe(true);
  });

  it('two independent reconnects against the same in-progress job each get exactly one initial frame, not a stream of duplicates', () => {
    const midJob = job({ stage: 'mapping', chunks: [{}, {}, {}], chunkResults: [{}, {}] });

    const connectionASnapshot = computeSseSnapshot(midJob);
    const connectionBSnapshot = computeSseSnapshot(midJob);

    expect(snapshotChanged(connectionASnapshot, null)).toBe(true);
    expect(snapshotChanged(connectionBSnapshot, null)).toBe(true);
    // Same underlying job state, so what each connection would emit is
    // identical content — but each is a fresh connection with its own
    // lastSnapshot of null, so both legitimately emit their own first frame.
    expect(connectionASnapshot).toEqual(connectionBSnapshot);
  });

  it('treats completed and failed as terminal, everything else as not', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('queued')).toBe(false);
    expect(isTerminal('processing')).toBe(false);
  });
});
