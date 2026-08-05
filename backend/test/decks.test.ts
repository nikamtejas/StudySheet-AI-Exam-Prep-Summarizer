import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const mockCreate = vi.fn();
const mockBetaCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
    beta: { messages: { create: mockBetaCreate } },
  })),
}));

import { getMongoConnection } from '../src/lib/mongo';
import { SummaryModel } from '../src/models/Summary';
import { DeckModel } from '../src/models/Deck';
import { CardModel } from '../src/models/Card';
import { generateDeckForSummary, getOrGenerateDeck } from '../src/pipeline/decks';

let infraAvailable = false;

beforeAll(async () => {
  try {
    await getMongoConnection();
    infraAvailable = true;
  } catch {
    infraAvailable = false;
  }
  if (!infraAvailable) {
    console.warn('[decks.test.ts] Mongo not reachable — skipping. Run `docker compose up` to exercise these for real.');
  }
}, 10000);

const TEST_USER_PREFIX = 'test-decks-';

afterAll(async () => {
  if (infraAvailable) {
    await SummaryModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
    await DeckModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
    await CardModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
  }
});

async function makeSummary(userId: string) {
  return SummaryModel.create({
    jobId: `job-${randomUUID()}`,
    userId,
    sections: [],
    definitions: [
      { term: 'Inertia', definition: 'Resistance to a change in motion.', pageRef: 1, confidence: 'high' },
    ],
    examQuestions: [],
    problems: [],
    connections: [],
    version: 1,
  });
}

describe('generateDeckForSummary', () => {
  it('generates a deck and its cards with zero Anthropic API calls', async () => {
    if (!infraAvailable) return;
    mockCreate.mockClear();
    mockBetaCreate.mockClear();

    const summary = await makeSummary(`${TEST_USER_PREFIX}${randomUUID()}`);
    const deck = await generateDeckForSummary(summary);

    expect(deck.cardCount).toBe(1);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockBetaCreate).not.toHaveBeenCalled();

    const cards = await CardModel.find({ deckId: deck.id });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.front).toBe('Inertia');
  });

  it('is idempotent — calling it twice never creates duplicate cards', async () => {
    if (!infraAvailable) return;

    const summary = await makeSummary(`${TEST_USER_PREFIX}${randomUUID()}`);
    const first = await generateDeckForSummary(summary);
    const reloaded = await SummaryModel.findById(summary.id);
    const second = await generateDeckForSummary(reloaded!);

    expect(second.id).toBe(first.id);
    const cards = await CardModel.find({ deckId: first.id });
    expect(cards).toHaveLength(1);
  });
});

describe('getOrGenerateDeck', () => {
  it('returns null for a summary that does not exist', async () => {
    if (!infraAvailable) return;
    const deck = await getOrGenerateDeck('000000000000000000000000');
    expect(deck).toBeNull();
  });

  it('generates lazily on first request', async () => {
    if (!infraAvailable) return;
    const summary = await makeSummary(`${TEST_USER_PREFIX}${randomUUID()}`);
    const deck = await getOrGenerateDeck(summary.id);
    expect(deck?.summaryId).toBe(summary.id);
  });
});
