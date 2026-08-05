import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getMongoConnection } from '../src/lib/mongo';
import { CardModel } from '../src/models/Card';

// docs/studysheet-milestones.md M9: "The review queue query is index-backed
// and stays under 50ms at 10k cards." Needs real Mongo — the whole point is
// proving the compound index (models/Card.ts's userId+srs.dueAt) actually
// keeps this fast, not asserting it in the abstract. Skips gracefully when
// Mongo isn't reachable, same pattern as every other real-Mongo test file.
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
      '[review-queue-perf.test.ts] Mongo not reachable — skipping. Run `docker compose up` to exercise this for real.',
    );
  }
}, 10000);

const TEST_USER_PREFIX = 'test-review-perf-';

afterAll(async () => {
  if (infraAvailable) {
    await CardModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
  }
});

const CARD_COUNT = 10000;
const QUERY_BUDGET_MS = 50;

describe('review queue query performance', () => {
  it(`stays under ${QUERY_BUDGET_MS}ms for the due-cards query against ${CARD_COUNT} cards`, async () => {
    if (!infraAvailable) return;

    const userId = `${TEST_USER_PREFIX}${randomUUID()}`;
    const now = new Date();
    const docs = Array.from({ length: CARD_COUNT }, (_, i) => ({
      deckId: `deck-${i % 50}`,
      userId,
      front: `front ${i}`,
      back: `back ${i}`,
      kind: 'basic' as const,
      pageRef: 1,
      srs: {
        ease: 2.5,
        intervalDays: 1,
        // Half already due, half not — the realistic shape of a real deck,
        // and what makes this a real test of the index rather than a
        // full-collection scan that happens to be small.
        dueAt: i % 2 === 0 ? new Date(now.getTime() - 1000) : new Date(now.getTime() + 1000 * 60 * 60 * 24),
        reps: 1,
        lapses: 0,
      },
    }));
    await CardModel.insertMany(docs);

    const dueFilter = { userId, 'srs.dueAt': { $lte: now } };
    const start = performance.now();
    const [cards, dueCount] = await Promise.all([
      CardModel.find(dueFilter).sort({ 'srs.dueAt': 1 }).limit(20),
      CardModel.countDocuments(dueFilter),
    ]);
    const elapsedMs = performance.now() - start;

    expect(cards).toHaveLength(20);
    expect(dueCount).toBe(CARD_COUNT / 2);
    expect(elapsedMs).toBeLessThan(QUERY_BUDGET_MS);
  }, 30000);
});
