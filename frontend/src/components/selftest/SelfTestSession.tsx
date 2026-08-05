'use client';

import { useState } from 'react';
import { submitReviewGrade } from '@/lib/api';
import type { CardDTO, Grade } from '@/contracts';

// docs/studysheet-build-prompt.md §5: "Self-test mode. Exam questions with
// answers hidden, reveal on tap, plus a confidence tag (got it / shaky / no
// idea) that feeds directly into the spaced-repetition queue." Confidence
// tags aren't a separate scoring system — they're just a friendlier label
// on top of the same four-button grade scale review mode uses, submitted to
// the same endpoint, so there's exactly one place SM-2 state ever changes.
const CONFIDENCE_TO_GRADE: Record<string, Grade> = {
  'got it': 'good',
  shaky: 'hard',
  'no idea': 'again',
};

const CONFIDENCE_OPTIONS = ['no idea', 'shaky', 'got it'] as const;

export function SelfTestSession({ examCards }: { examCards: CardDTO[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [shownAt, setShownAt] = useState(Date.now());

  if (examCards.length === 0) {
    return <p className="text-base">No exam questions with a hint in this summary yet.</p>;
  }

  if (index >= examCards.length) {
    return <p className="text-lg font-semibold">Done — {examCards.length} question{examCards.length === 1 ? '' : 's'} reviewed.</p>;
  }

  const card = examCards[index];
  if (!card) return null;

  async function tag(confidence: (typeof CONFIDENCE_OPTIONS)[number]) {
    if (!card) return;
    // Best-effort — self-test's own flow already advances regardless
    // (reliability isn't as critical here as review mode's queue since a
    // self-test pass isn't the primary SRS-scheduling entry point), but the
    // grade should still land when the network cooperates.
    void submitReviewGrade(card.id, CONFIDENCE_TO_GRADE[confidence], Date.now() - shownAt).catch(() => {});
    setRevealed(false);
    setShownAt(Date.now());
    setIndex((i) => i + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted font-mono text-xs">
        Question {index + 1} of {examCards.length}
      </p>
      <div className="border-edge bg-surface min-h-32 rounded-md border p-6">
        <p className="text-lg">{card.front}</p>
        {revealed && <p className="border-edge mt-4 border-t pt-4 text-base">{card.back}</p>}
      </div>

      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="bg-amber text-ink rounded-md px-6 py-3 text-base font-semibold focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none"
        >
          Reveal answer
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {CONFIDENCE_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => void tag(c)}
              className="border-edge hover:border-muted rounded-md border px-4 py-3 text-sm font-semibold capitalize focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
