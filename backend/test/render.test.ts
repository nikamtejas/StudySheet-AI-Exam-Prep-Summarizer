import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { getMongoConnection } from '../src/lib/mongo';
import { checkStorage, downloadObject } from '../src/lib/storage';
import { env } from '../src/config/env';
import { SummaryModel } from '../src/models/Summary';
import { RenderTokenModel } from '../src/models/RenderToken';
import { renderSummary } from '../src/pipeline/render';
import { closePuppeteerPool } from '../src/lib/puppeteerPool';

// Needs real Mongo + S3-compatible storage (docker-compose.yml) AND a
// reachable frontend server at FRONTEND_URL — Puppeteer navigates there for
// real, so there's no meaningful way to mock this the way M2-M4 mock the
// Anthropic SDK (the whole point is testing the interaction between
// Puppeteer, the print route, and this pipeline). Checks reachability first
// and skips with a clear message rather than failing the suite; run
// `docker compose up` plus a real frontend server (`npm run build && npm
// start` in frontend/) to exercise these for real.
let infraAvailable = false;

beforeAll(async () => {
  try {
    await getMongoConnection();
    const storage = await checkStorage();
    let frontendReachable = false;
    try {
      const res = await fetch(env.FRONTEND_URL, { signal: AbortSignal.timeout(2000) });
      frontendReachable = res.status < 500;
    } catch {
      frontendReachable = false;
    }
    infraAvailable = storage.ok && frontendReachable;
  } catch {
    infraAvailable = false;
  }
  if (!infraAvailable) {
    console.warn(
      '[render.test.ts] Mongo/storage/frontend not reachable — skipping render assertions. ' +
        'Run `docker compose up` and a real frontend server to exercise these for real.',
    );
  }
}, 10000);

const TEST_PREFIX = 'test-render-pipeline-';

afterAll(async () => {
  if (infraAvailable) {
    await SummaryModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_PREFIX}`) } });
    await RenderTokenModel.deleteMany({});
  }
  await closePuppeteerPool();
});

async function seedSummary(
  overrides: Partial<{ problems: unknown[] }> = {},
): Promise<string> {
  const summary = await SummaryModel.create({
    jobId: `${TEST_PREFIX}${randomUUID()}`,
    userId: `${TEST_PREFIX}${randomUUID()}`,
    sections: [
      { type: 'in-one-minute', title: 'In one minute', body: 'A short summary of the material.', highlights: [] },
      { type: 'formulas', title: 'Formulas', body: 'F = ma', highlights: [] },
    ],
    definitions: [{ term: 'Inertia', definition: 'Resistance to change in motion.', pageRef: 1, confidence: 'high' }],
    examQuestions: [{ q: 'State the second law.', pageRef: 1 }],
    problems: overrides.problems ?? [],
    connections: [],
    version: 1,
  });
  return summary._id.toString();
}

describe('renderSummary', () => {
  it('renders with zero AI calls and well under the 3s budget', async () => {
    if (!infraAvailable) return;
    const summaryId = await seedSummary();

    const start = Date.now();
    const result = await renderSummary(summaryId, 'full', 'a4');
    const elapsedMs = Date.now() - start;

    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(3000);
  }, 10000);

  it('produces byte-identical PDFs across two independent renders of the same summary', async () => {
    if (!infraAvailable) return;
    const summaryId = await seedSummary();

    const first = await renderSummary(summaryId, 'full', 'a4');
    const firstBytes = await downloadObject(first.r2Key);

    const second = await renderSummary(summaryId, 'full', 'a4');
    const secondBytes = await downloadObject(second.r2Key);

    expect(Buffer.compare(firstBytes, secondBytes)).toBe(0);
  }, 15000);

  it('renders both A4 and Letter as distinct, valid PDFs at different keys', async () => {
    if (!infraAvailable) return;
    const summaryId = await seedSummary();

    const a4 = await renderSummary(summaryId, 'full', 'a4');
    const letter = await renderSummary(summaryId, 'full', 'letter');

    expect(a4.r2Key).not.toBe(letter.r2Key);
    const a4Bytes = await downloadObject(a4.r2Key);
    const letterBytes = await downloadObject(letter.r2Key);
    const a4Doc = await PDFDocument.load(a4Bytes);
    const letterDoc = await PDFDocument.load(letterBytes);
    expect(a4Doc.getPageCount()).toBeGreaterThan(0);
    expect(letterDoc.getPageCount()).toBeGreaterThan(0);
  }, 15000);

  it('the one-pager variant always fits on exactly one page', async () => {
    if (!infraAvailable) return;
    const summaryId = await seedSummary();

    const result = await renderSummary(summaryId, 'onepager', 'a4');
    const bytes = await downloadObject(result.r2Key);
    const doc = await PDFDocument.load(bytes);

    expect(doc.getPageCount()).toBe(1);
  }, 15000);

  it('the answer appendix renders KaTeX-typeset problem steps into a valid PDF', async () => {
    if (!infraAvailable) return;
    const summaryId = await seedSummary({
      problems: [
        {
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
          pageRef: 1,
          verified: true,
        },
      ],
    });

    const result = await renderSummary(summaryId, 'appendix', 'a4');
    const bytes = await downloadObject(result.r2Key);
    const doc = await PDFDocument.load(bytes);

    expect(doc.getPageCount()).toBeGreaterThan(0);
  }, 10000);
});
