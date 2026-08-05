import { DeckModel, type DeckInstance } from '../models/Deck';
import { CardModel, type CardInstance } from '../models/Card';
import { SummaryModel, type SummaryInstance } from '../models/Summary';
import { generateCards } from './deckGeneration';
import { initialSrs } from './sm2';
import type { DeckDTO, CardDTO } from '../contracts';

export function toDeckDTO(deck: DeckInstance): DeckDTO {
  return {
    id: deck.id,
    summaryId: deck.summaryId,
    userId: deck.userId,
    cardCount: deck.cardCount,
    source: deck.source,
    createdAt: deck.createdAt.toISOString(),
  };
}

export function toCardDTO(card: CardInstance): CardDTO {
  return {
    id: card.id,
    deckId: card.deckId,
    userId: card.userId,
    front: card.front,
    back: card.back,
    kind: card.kind,
    pageRef: card.pageRef,
    srs: {
      ease: card.srs.ease,
      intervalDays: card.srs.intervalDays,
      dueAt: card.srs.dueAt.toISOString(),
      reps: card.srs.reps,
      lapses: card.srs.lapses,
    },
  };
}

// docs/studysheet-build-prompt.md §5: "Every summary produces a deck
// automatically... no model calls." Idempotent by design (reliability
// invariant 2) — `summary.deckId` is the checkpoint: once set, this returns
// the existing deck rather than generating duplicate Card documents, so
// calling it twice (the automatic hook in pipeline/orchestrate.ts, and a
// user's own on-demand GET /api/decks/:summaryId) is always safe.
export async function generateDeckForSummary(summary: SummaryInstance): Promise<DeckDTO> {
  if (summary.deckId) {
    const existing = await DeckModel.findById(summary.deckId);
    if (existing) return toDeckDTO(existing);
  }

  const drafts = generateCards(summary);
  const now = new Date();

  const deck = await DeckModel.create({
    summaryId: summary.id,
    userId: summary.userId,
    cardCount: drafts.length,
    source: 'auto',
  });

  if (drafts.length > 0) {
    await CardModel.insertMany(
      drafts.map((draft) => ({
        deckId: deck.id,
        userId: summary.userId,
        front: draft.front,
        back: draft.back,
        kind: draft.kind,
        pageRef: draft.pageRef,
        srs: initialSrs(now),
      })),
    );
  }

  summary.deckId = deck.id;
  await summary.save();

  return toDeckDTO(deck);
}

// The lazy on-demand path (GET /api/decks/:summaryId) — fetches the summary
// itself first, since generateDeckForSummary needs the full document (to
// read/write deckId), not just an id.
export async function getOrGenerateDeck(summaryId: string): Promise<DeckDTO | null> {
  const summary = await SummaryModel.findById(summaryId);
  if (!summary) return null;
  return generateDeckForSummary(summary);
}
