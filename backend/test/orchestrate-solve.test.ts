import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const mockCreate = vi.fn();

// Real error classes (not the mocked default export) — ai/errors.ts's
// isTransientAiError does `instanceof APIConnectionError` etc., which only
// works against the actual classes, not fakes.
vi.mock('@anthropic-ai/sdk', async () => {
  const actual = await vi.importActual<typeof import('@anthropic-ai/sdk')>('@anthropic-ai/sdk');
  return {
    ...actual,
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

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
import type { ChunkProblem } from '../src/pipeline/map';

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
      '[orchestrate-solve.test.ts] Mongo not reachable — skipping resumability assertions. ' +
        'Run `docker compose up` to exercise these for real.',
    );
  }
}, 10000);

// Disjoint from every other real-Mongo test file's prefix (test-text-orch-,
// test-vision-orch-) — see [[project-m3-vision-path-decisions]] on why a
// shared prefix races across vitest's parallel worker processes.
const TEST_USER_PREFIX = 'test-solve-orch-';

afterAll(async () => {
  if (infraAvailable) {
    await JobModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
    await SummaryModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
    await UsageModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
    await DeckModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
    await CardModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
  }
});

function textResponse(payload: unknown, inputTokens = 50, outputTokens = 30) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

const solvedPayload = {
  problem: 'Solve for x: 2x = 10',
  subject: 'math',
  given: ['2x = 10'],
  goal: 'Find x',
  strategy: 'Divide both sides by 2',
  steps: [{ n: 1, action: 'Divide both sides by 2', math: 'x = 5', why: 'Isolates x' }],
  answer: { value: '5' },
  check: 'Substitute back: 2(5) = 10',
  commonMistake: 'Forgetting to divide both sides',
  memoryHook: 'A balance scale: same operation, both sides',
};

const synthesisResult = { sections: [], definitions: [], examQuestions: [] };

function makeProblems(count: number): ChunkProblem[] {
  return Array.from({ length: count }, (_, i) => ({ statement: `Problem ${i}`, pageRef: i + 1 }));
}

describe('processJob resumability — solving stage', () => {
  it('solves 4 problems concurrently in one batch, then synthesis, from a fresh job', async () => {
    if (!infraAvailable) return;

    const job = await JobModel.create({
      userId: `${TEST_USER_PREFIX}${randomUUID()}`,
      documentIds: ['unused-in-this-test'],
      status: 'queued',
      stage: 'solving',
      config: { depth: 'balanced' },
      problems: makeProblems(4),
      problemResults: [],
      tokensUsed: { input: 0, output: 0 },
      costCents: 0,
    });

    mockCreate.mockReset();
    // 4 problems x 2 agreeing attempts each = 8 solve calls, then 1 synthesis call.
    for (let i = 0; i < 8; i++) mockCreate.mockResolvedValueOnce(textResponse(solvedPayload));
    mockCreate.mockResolvedValueOnce(textResponse(synthesisResult));

    await processJob(job.id);

    expect(mockCreate).toHaveBeenCalledTimes(9);

    const final = await JobModel.findById(job.id);
    expect(final?.stage).toBe('done');
    expect(final?.status).toBe('completed');
    expect(final?.problemResults).toHaveLength(4);
    expect(final?.problemResults.every((r) => r.result.verified)).toBe(true);
    expect(final?.problemResults.map((r) => r.problemIndex).sort()).toEqual([0, 1, 2, 3]);

    const summary = await SummaryModel.findById(final?.summaryId);
    expect(summary?.problems).toHaveLength(4);
  });

  it('a crash on the second batch, followed by a fresh run, completes without re-solving the first batch', async () => {
    if (!infraAvailable) return;

    // 5 problems, concurrency cap 4 (see pipeline/orchestrate.ts's
    // SOLVE_CONCURRENCY) — batch 1 is problems 0-3, batch 2 is problem 4 alone.
    const job = await JobModel.create({
      userId: `${TEST_USER_PREFIX}${randomUUID()}`,
      documentIds: ['unused-in-this-test'],
      status: 'queued',
      stage: 'solving',
      config: { depth: 'balanced' },
      problems: makeProblems(5),
      problemResults: [],
      tokensUsed: { input: 0, output: 0 },
      costCents: 0,
    });

    mockCreate.mockReset();
    for (let i = 0; i < 8; i++) mockCreate.mockResolvedValueOnce(textResponse(solvedPayload)); // batch 1: 4 problems succeed
    mockCreate
      .mockResolvedValueOnce(textResponse(solvedPayload)) // problem 4, attempt 1
      .mockRejectedValueOnce(new Error('simulated solve failure')); // problem 4, attempt 2 — the "crash"

    await expect(processJob(job.id)).rejects.toThrow('simulated solve failure');

    const afterFailure = await JobModel.findById(job.id);
    expect(afterFailure?.status).toBe('failed');
    // Batch 1 (4 problems) was persisted before batch 2 ever started.
    expect(afterFailure?.problemResults).toHaveLength(4);
    expect(afterFailure?.problemResults.map((r) => r.problemIndex).sort()).toEqual([0, 1, 2, 3]);

    afterFailure!.status = 'active';
    await afterFailure!.save();

    mockCreate.mockReset();
    mockCreate
      .mockResolvedValueOnce(textResponse(solvedPayload)) // problem 4, retried
      .mockResolvedValueOnce(textResponse(solvedPayload))
      .mockResolvedValueOnce(textResponse(synthesisResult)); // synthesis

    await processJob(job.id);

    // Exactly 3 calls this run — problem 4's pair plus synthesis. The 4
    // already-solved problems from batch 1 were never re-billed.
    expect(mockCreate).toHaveBeenCalledTimes(3);

    const final = await JobModel.findById(job.id);
    expect(final?.stage).toBe('done');
    expect(final?.problemResults).toHaveLength(5);
    expect(final?.problemResults.map((r) => r.problemIndex).sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
