import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

vi.mock('../src/config/env', async () => {
  const actual = await vi.importActual<typeof import('../src/config/env')>('../src/config/env');
  return { env: { ...actual.env, ANTHROPIC_API_KEY: 'test-key' } };
});

import { getMongoConnection } from '../src/lib/mongo';
import { JobModel } from '../src/models/Job';
import { SummaryModel } from '../src/models/Summary';
import { UsageModel } from '../src/models/Usage';
import { DeckModel } from '../src/models/Deck';
import { CardModel } from '../src/models/Card';
import { processJob } from '../src/pipeline/orchestrate';
import type { Chunk } from '../src/pipeline/chunk';

// Needs real Mongo. Skips gracefully (with a console warning) when it isn't
// reachable — same pattern as test/ingest.test.ts — and runs for real in CI.
let infraAvailable = false;

beforeAll(async () => {
  try {
    await getMongoConnection();
    infraAvailable = true;
  } catch {
    infraAvailable = false;
  }
  if (!infraAvailable) {
    console.warn(
      '[orchestrate.test.ts] Mongo not reachable — skipping resumability assertions. ' +
        'Run `docker compose up` to exercise these for real.',
    );
  }
}, 10000);

// Prefix is disjoint from other real-Mongo test files (e.g.
// orchestrate-vision.test.ts) so a broad afterAll cleanup here can never
// race with — and delete — another file's in-flight job when vitest runs
// files in parallel worker processes against the same database.
const TEST_USER_PREFIX = 'test-text-orch-';

afterAll(async () => {
  if (infraAvailable) {
    await JobModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
    await SummaryModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
    await UsageModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
    await DeckModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
    await CardModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
  }
});

function textResponse(payload: unknown, inputTokens = 10, outputTokens = 5) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

const emptyChunkResult = { definitions: [], keyPoints: [], formulas: [], problems: [], pageRefs: [1] };
const synthesisResult = { sections: [], definitions: [], examQuestions: [] };

function makeChunks(count: number): Chunk[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    startPage: i + 1,
    endPage: i + 1,
    text: `[page ${i + 1}]\nchunk ${i} text`,
    overlapsPreviousBy: 0,
  }));
}

describe('processJob resumability', () => {
  it('resumes mapping from persisted partial progress without re-billing finished chunks', async () => {
    if (!infraAvailable) return;

    const job = await JobModel.create({
      userId: `${TEST_USER_PREFIX}${randomUUID()}`,
      documentIds: ['unused-in-this-test'],
      status: 'active',
      stage: 'mapping',
      config: { depth: 'balanced' },
      chunks: makeChunks(3),
      // Simulates exactly what a SIGKILL between mapChunk() resolving and
      // job.save() persisting would leave behind: chunk 0 done, 1 and 2 not.
      chunkResults: [
        { chunkIndex: 0, result: emptyChunkResult, inputTokens: 10, outputTokens: 5, costCents: 0.001 },
      ],
      tokensUsed: { input: 10, output: 5 },
      costCents: 0.001,
    });

    mockCreate.mockReset();
    mockCreate
      .mockResolvedValueOnce(textResponse(emptyChunkResult)) // chunk 1
      .mockResolvedValueOnce(textResponse(emptyChunkResult)) // chunk 2
      .mockResolvedValueOnce(textResponse(synthesisResult)); // synthesis

    await processJob(job.id);

    // Only 3 calls total: chunk 1, chunk 2, synthesis — chunk 0 was never re-billed.
    expect(mockCreate).toHaveBeenCalledTimes(3);

    const final = await JobModel.findById(job.id);
    expect(final?.stage).toBe('done');
    expect(final?.status).toBe('completed');
    expect(final?.chunkResults).toHaveLength(3);
    expect(final?.chunkResults.map((r) => r.chunkIndex).sort()).toEqual([0, 1, 2]);
    expect(final?.summaryId).toBeTruthy();
  });

  it('a mid-run failure followed by a fresh run completes without re-billing what already succeeded', async () => {
    if (!infraAvailable) return;

    const job = await JobModel.create({
      userId: `${TEST_USER_PREFIX}${randomUUID()}`,
      documentIds: ['unused-in-this-test'],
      status: 'queued',
      stage: 'mapping',
      config: { depth: 'balanced' },
      chunks: makeChunks(3),
      chunkResults: [],
      tokensUsed: { input: 0, output: 0 },
      costCents: 0,
    });

    mockCreate.mockReset();
    mockCreate
      .mockResolvedValueOnce(textResponse(emptyChunkResult)) // chunk 0 succeeds
      .mockRejectedValueOnce(new Error('simulated network failure')); // chunk 1 fails — the "crash"

    await expect(processJob(job.id)).rejects.toThrow('simulated network failure');

    const afterFailure = await JobModel.findById(job.id);
    expect(afterFailure?.status).toBe('failed');
    expect(afterFailure?.chunkResults).toHaveLength(1);

    // A real deploy would requeue the job (BullMQ retry, or a fresh worker
    // picking it back up) — that's the "restart" being simulated here.
    afterFailure!.status = 'active';
    await afterFailure!.save();

    mockCreate.mockReset();
    mockCreate
      .mockResolvedValueOnce(textResponse(emptyChunkResult)) // chunk 1, retried
      .mockResolvedValueOnce(textResponse(emptyChunkResult)) // chunk 2
      .mockResolvedValueOnce(textResponse(synthesisResult)); // synthesis

    await processJob(job.id);

    // Exactly 3 calls on this second run — chunk 0 from the first run was
    // never repeated.
    expect(mockCreate).toHaveBeenCalledTimes(3);

    const final = await JobModel.findById(job.id);
    expect(final?.stage).toBe('done');
    expect(final?.chunkResults).toHaveLength(3);
  });
});
