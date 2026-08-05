import type { Grade } from '../contracts';

// Modified SM-2 — the Anki-style four-button scheme (again/hard/good/easy),
// not the original 6-point-quality SM-2 (docs/studysheet-build-prompt.md
// §5: "four-button grading"). Interval is day-granularity only (no intraday
// relearning steps) to match Card.srs.intervalDays' shape (§8) — a lapsed
// card comes back in 1 day, not 10 minutes.
export const EASE_FLOOR = 1.3;
export const EASE_START = 2.5;
const HARD_INTERVAL_MULTIPLIER = 1.2;
const EASY_INTERVAL_MULTIPLIER = 1.3;
const HARD_EASE_PENALTY = 0.15;
const AGAIN_EASE_PENALTY = 0.2;
const EASY_EASE_BONUS = 0.15;
const SECOND_REP_INTERVAL_DAYS = 6;
const FIRST_EASY_INTERVAL_DAYS = 4;

export interface SrsInput {
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
}

export interface SrsResult extends SrsInput {
  dueAt: Date;
}

export function initialSrs(now: Date = new Date()): SrsResult {
  return { ease: EASE_START, intervalDays: 0, reps: 0, lapses: 0, dueAt: now };
}

// Pure — no I/O, no Date.now() unless the caller omits `now`, so every call
// site (api/routes/review.ts, and every test here) gets deterministic,
// reproducible output for the same inputs.
export function applyGrade(srs: SrsInput, grade: Grade, now: Date = new Date()): SrsResult {
  let ease = srs.ease;
  let reps = srs.reps;
  let lapses = srs.lapses;
  let intervalDays: number;

  switch (grade) {
    case 'again':
      // A lapse: back to square one on repetitions, but the ease penalty and
      // lapse count are permanent — only 'again' ever touches `lapses`, and
      // it only ever goes up.
      lapses += 1;
      reps = 0;
      ease = Math.max(EASE_FLOOR, ease - AGAIN_EASE_PENALTY);
      intervalDays = 1;
      break;
    case 'hard':
      reps += 1;
      ease = Math.max(EASE_FLOOR, ease - HARD_EASE_PENALTY);
      // Anki's own "hard" doesn't multiply by ease at all, just a flat 1.2x
      // on the previous interval — the ease reduction is what makes future
      // reps grow slower, not this one.
      intervalDays = reps === 1 ? 1 : Math.max(1, Math.round(srs.intervalDays * HARD_INTERVAL_MULTIPLIER));
      break;
    case 'good':
      reps += 1;
      intervalDays =
        reps === 1 ? 1 : reps === 2 ? SECOND_REP_INTERVAL_DAYS : Math.round(srs.intervalDays * ease);
      break;
    case 'easy':
      reps += 1;
      ease += EASY_EASE_BONUS;
      intervalDays =
        reps === 1 ? FIRST_EASY_INTERVAL_DAYS : Math.round(srs.intervalDays * ease * EASY_INTERVAL_MULTIPLIER);
      break;
  }

  const dueAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return { ease, intervalDays, reps, lapses, dueAt };
}
