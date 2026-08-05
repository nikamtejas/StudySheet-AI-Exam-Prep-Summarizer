'use client';

import { useEffect, useState, useCallback } from 'react';
import { getReviewQueue, submitReviewGrade } from '@/lib/api';
import { loadQueue, saveQueue, addToQueue, flushQueue } from '@/lib/reviewQueue';
import { ReviewCardFront } from './ReviewCardFront';
import type { CardDTO, Grade } from '@/contracts';

const GRADE_LABELS: Record<Grade, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

async function syncGrade(item: { cardId: string; grade: Grade; msTaken: number }): Promise<void> {
  await submitReviewGrade(item.cardId, item.grade, item.msTaken);
}

// docs/studysheet-build-prompt.md §5: "due-card count on the dashboard,
// four-button grading... sessions capped at 20 cards so it fits a bus ride"
// and "offline-tolerant queueing". The queue itself (lib/reviewQueue.ts) is
// what makes a grade tapped on a spotty connection durable — every grade
// goes through it before syncing, never straight to the network.
export function ReviewSession() {
  const [cards, setCards] = useState<CardDTO[] | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [shownAt, setShownAt] = useState(Date.now());
  const [loadError, setLoadError] = useState(false);

  const loadSession = useCallback(async () => {
    // Flush anything queued from a previous — possibly offline — session
    // first. Fetching a fresh queue before that could show a card whose
    // server-side due date is already stale relative to an unsynced grade.
    const flushed = await flushQueue(loadQueue(), syncGrade);
    saveQueue(flushed);

    try {
      const { cards: due, dueCount: total } = await getReviewQueue();
      setCards(due);
      setDueCount(total);
      setIndex(0);
      setRevealed(false);
      setShownAt(Date.now());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  async function grade(g: Grade) {
    const card = cards?.[index];
    if (!card) return;

    const queued = addToQueue(loadQueue(), {
      id: `${card.id}-${Date.now()}`,
      cardId: card.id,
      grade: g,
      msTaken: Date.now() - shownAt,
      queuedAt: Date.now(),
    });
    saveQueue(queued);

    // Best-effort immediate sync — on failure (offline), the queue already
    // has it durably; a future flush (next session load, or a retry) picks
    // it up. Never blocks advancing to the next card either way.
    void flushQueue(queued, syncGrade).then(saveQueue);

    setRevealed(false);
    setShownAt(Date.now());
    setIndex((i) => i + 1);
  }

  if (loadError) {
    return <p className="text-muted text-sm">Couldn&apos;t load your review queue. Try again in a moment.</p>;
  }

  if (!cards) {
    return (
      <p className="text-muted text-sm" role="status">
        Loading…
      </p>
    );
  }

  if (cards.length === 0) {
    return <p className="text-base">Nothing due right now. Come back later.</p>;
  }

  if (index >= cards.length) {
    const remaining = Math.max(0, dueCount - cards.length);
    return (
      <div className="flex flex-col gap-3">
        <p className="text-lg font-semibold">Session complete.</p>
        <p className="text-muted text-sm">
          {remaining > 0 ? `${remaining} more due — come back for another session.` : 'Nothing else due right now.'}
        </p>
      </div>
    );
  }

  const card = cards[index];
  if (!card) return null;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted font-mono text-xs">
        Card {index + 1} of {cards.length} · {dueCount} due total
      </p>
      <div className="border-edge bg-surface min-h-32 rounded-md border p-6">
        <ReviewCardFront card={card} revealed={revealed} />
        {revealed && card.kind !== 'cloze' && (
          <p className="border-edge mt-4 border-t pt-4 text-base">{card.back}</p>
        )}
      </div>

      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="bg-amber text-ink rounded-md px-6 py-3 text-base font-semibold focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none"
        >
          Show answer
        </button>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {(['again', 'hard', 'good', 'easy'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => void grade(g)}
              className="border-edge hover:border-muted rounded-md border px-4 py-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none"
            >
              {GRADE_LABELS[g]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
