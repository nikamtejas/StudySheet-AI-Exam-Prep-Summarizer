import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const mockCreate = vi.fn();
const mockBetaCreate = vi.fn();
const mockFilesUpload = vi.fn();
const mockFilesDelete = vi.fn();

// Real error classes (not the mocked default export) — ai/errors.ts's
// isTransientAiError does `instanceof APIConnectionError` etc., which only
// works against the actual classes, not fakes.
vi.mock('@anthropic-ai/sdk', async () => {
  const actual = await vi.importActual<typeof import('@anthropic-ai/sdk')>('@anthropic-ai/sdk');
  return {
    ...actual,
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
      beta: {
        messages: { create: mockBetaCreate },
        files: { upload: mockFilesUpload, delete: mockFilesDelete },
      },
    })),
    toFile: vi.fn().mockImplementation(async (buffer: Buffer, filename: string) => ({ buffer, filename })),
  };
});

vi.mock('../src/config/env', async () => {
  const actual = await vi.importActual<typeof import('../src/config/env')>('../src/config/env');
  return { env: { ...actual.env, ANTHROPIC_API_KEY: 'test-key' } };
});

// Vision-path mapping downloads each batch's raster via downloadObject(rasterKey)
// — mocked here so this test only needs real Mongo, matching the "mock-tested
// only" AI-touching pattern used across M2/M3 (see mapVision.test.ts).
vi.mock('../src/lib/storage', () => ({
  downloadObject: vi.fn().mockResolvedValue(Buffer.from('fake-jpeg-bytes')),
}));

import { getMongoConnection } from '../src/lib/mongo';
import { JobModel } from '../src/models/Job';
import { SummaryModel } from '../src/models/Summary';
import { UsageModel } from '../src/models/Usage';
import { DeckModel } from '../src/models/Deck';
import { CardModel } from '../src/models/Card';
import { processJob } from '../src/pipeline/orchestrate';
import type { Chunk } from '../src/pipeline/chunk';
import type { VisionChunk } from '../src/pipeline/chunkVision';

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
      '[orchestrate-vision.test.ts] Mongo not reachable — skipping resumability assertions. ' +
        'Run `docker compose up` to exercise these for real.',
    );
  }
}, 10000);

afterAll(async () => {
  if (infraAvailable) {
    await JobModel.deleteMany({ userId: { $regex: /^test-vision-orch-/ } });
    await SummaryModel.deleteMany({ userId: { $regex: /^test-vision-orch-/ } });
    await UsageModel.deleteMany({ userId: { $regex: /^test-vision-orch-/ } });
    await DeckModel.deleteMany({ userId: { $regex: /^test-vision-orch-/ } });
    await CardModel.deleteMany({ userId: { $regex: /^test-vision-orch-/ } });
  }
});

function textResponse(payload: unknown, inputTokens = 10, outputTokens = 5) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

const emptyChunkResult = {
  definitions: [],
  keyPoints: [],
  formulas: [],
  problems: [],
  pageRefs: [1],
  unreadablePages: [],
};
const visionChunkResult = {
  definitions: [],
  keyPoints: [],
  formulas: [],
  problems: [],
  pageRefs: [2, 3],
  unreadablePages: [],
};
const synthesisResult = { sections: [], definitions: [], examQuestions: [] };

function makeTextChunks(count: number): Chunk[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    startPage: i + 1,
    endPage: i + 1,
    text: `[page ${i + 1}]\nchunk ${i} text`,
    overlapsPreviousBy: 0,
  }));
}

// A single vision batch, indexed to continue right after the text chunks —
// exactly what pipeline/orchestrate.ts's "chunking" stage produces (see
// job.visionChunks in models/Job.ts).
function makeVisionChunk(index: number): VisionChunk {
  return { index, pages: [2, 3], rasterKeys: ['raster/page-2.jpg', 'raster/page-3.jpg'] };
}

describe('processJob resumability — mixed text + vision job', () => {
  it('resumes from a job with the text chunk already done, completing the vision batch and synthesis', async () => {
    if (!infraAvailable) return;

    const job = await JobModel.create({
      userId: `test-vision-orch-${randomUUID()}`,
      documentIds: ['unused-in-this-test'],
      status: 'active',
      stage: 'mapping',
      config: { depth: 'balanced' },
      chunks: makeTextChunks(1),
      visionChunks: [makeVisionChunk(1)],
      // Simulates a crash right after the text chunk persisted but before the
      // vision batch was attempted.
      chunkResults: [
        { chunkIndex: 0, result: emptyChunkResult, inputTokens: 10, outputTokens: 5, costCents: 0.001 },
      ],
      tokensUsed: { input: 10, output: 5 },
      costCents: 0.001,
    });

    mockCreate.mockReset();
    mockBetaCreate.mockReset();
    mockFilesUpload.mockReset();
    mockFilesDelete.mockReset();

    mockFilesUpload
      .mockResolvedValueOnce({ id: 'file_page2' })
      .mockResolvedValueOnce({ id: 'file_page3' });
    mockBetaCreate.mockResolvedValueOnce(textResponse(visionChunkResult)); // vision batch
    mockCreate.mockResolvedValueOnce(textResponse(synthesisResult)); // synthesis (text-only)

    await processJob(job.id);

    // The text chunk was never re-billed: only the vision batch (beta
    // endpoint) and the final synthesis (GA endpoint) ran this time.
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockBetaCreate).toHaveBeenCalledTimes(1);
    expect(mockFilesUpload).toHaveBeenCalledTimes(2);
    expect(mockFilesDelete).toHaveBeenCalledTimes(2);

    const final = await JobModel.findById(job.id);
    expect(final?.stage).toBe('done');
    expect(final?.status).toBe('completed');
    expect(final?.chunkResults).toHaveLength(2);
    expect(final?.chunkResults.map((r) => r.chunkIndex).sort()).toEqual([0, 1]);
    expect(final?.summaryId).toBeTruthy();
  });

  it('a crash during the vision batch, followed by a fresh run, completes without re-billing the text chunk', async () => {
    if (!infraAvailable) return;

    const job = await JobModel.create({
      userId: `test-vision-orch-${randomUUID()}`,
      documentIds: ['unused-in-this-test'],
      status: 'queued',
      stage: 'mapping',
      config: { depth: 'balanced' },
      chunks: makeTextChunks(1),
      visionChunks: [makeVisionChunk(1)],
      chunkResults: [],
      tokensUsed: { input: 0, output: 0 },
      costCents: 0,
    });

    mockCreate.mockReset();
    mockBetaCreate.mockReset();
    mockFilesUpload.mockReset();
    mockFilesDelete.mockReset();

    mockCreate.mockResolvedValueOnce(textResponse(emptyChunkResult)); // text chunk 0 succeeds
    mockFilesUpload
      .mockResolvedValueOnce({ id: 'file_page2' })
      .mockResolvedValueOnce({ id: 'file_page3' });
    mockBetaCreate.mockRejectedValueOnce(new Error('simulated vision failure')); // the "crash"

    await expect(processJob(job.id)).rejects.toThrow('simulated vision failure');

    const afterFailure = await JobModel.findById(job.id);
    expect(afterFailure?.status).toBe('failed');
    expect(afterFailure?.chunkResults).toHaveLength(1);
    expect(afterFailure?.chunkResults[0]?.chunkIndex).toBe(0);
    // Files uploaded before the failing call are still cleaned up (mapVision's
    // finally-block), even though the batch itself has to be retried.
    expect(mockFilesDelete).toHaveBeenCalledTimes(2);

    afterFailure!.status = 'active';
    await afterFailure!.save();

    mockCreate.mockReset();
    mockBetaCreate.mockReset();
    mockFilesUpload.mockReset();
    mockFilesDelete.mockReset();

    mockFilesUpload
      .mockResolvedValueOnce({ id: 'file_page2' })
      .mockResolvedValueOnce({ id: 'file_page3' });
    mockBetaCreate.mockResolvedValueOnce(textResponse(visionChunkResult)); // vision batch, retried
    mockCreate.mockResolvedValueOnce(textResponse(synthesisResult)); // synthesis

    await processJob(job.id);

    // Exactly one GA call (synthesis) and one beta call (vision retry) this
    // run — the text chunk from the first run was never repeated.
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockBetaCreate).toHaveBeenCalledTimes(1);

    const final = await JobModel.findById(job.id);
    expect(final?.stage).toBe('done');
    expect(final?.chunkResults).toHaveLength(2);
    expect(final?.chunkResults.map((r) => r.chunkIndex).sort()).toEqual([0, 1]);
  });
});
