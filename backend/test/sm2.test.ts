import { describe, it, expect } from 'vitest';
import { applyGrade, initialSrs, EASE_FLOOR, EASE_START, type SrsInput } from '../src/pipeline/sm2';

const NOW = new Date('2026-01-01T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

describe('initialSrs', () => {
  it('starts a new card at ease 2.5, interval 0, no reps or lapses', () => {
    const srs = initialSrs(NOW);
    expect(srs).toEqual({ ease: EASE_START, intervalDays: 0, reps: 0, lapses: 0, dueAt: NOW });
  });
});

describe('applyGrade — good', () => {
  it('first good rep is due in 1 day', () => {
    const result = applyGrade(initialSrs(NOW), 'good', NOW);
    expect(result.intervalDays).toBe(1);
    expect(result.reps).toBe(1);
    expect(daysBetween(NOW, result.dueAt)).toBe(1);
  });

  it('second good rep is due in 6 days regardless of ease', () => {
    const afterFirst = applyGrade(initialSrs(NOW), 'good', NOW);
    const afterSecond = applyGrade(afterFirst, 'good', NOW);
    expect(afterSecond.intervalDays).toBe(6);
    expect(afterSecond.reps).toBe(2);
  });

  it('third and later good reps multiply the previous interval by ease', () => {
    let srs: SrsInput = initialSrs(NOW);
    srs = applyGrade(srs, 'good', NOW);
    srs = applyGrade(srs, 'good', NOW);
    const third = applyGrade(srs, 'good', NOW);
    expect(third.intervalDays).toBe(Math.round(6 * EASE_START));
    expect(third.reps).toBe(3);
  });

  it('does not change ease', () => {
    const result = applyGrade(initialSrs(NOW), 'good', NOW);
    expect(result.ease).toBe(EASE_START);
  });

  it('compounds correctly over many consecutive good grades', () => {
    let srs: SrsInput = initialSrs(NOW);
    const intervals: number[] = [];
    for (let i = 0; i < 6; i++) {
      srs = applyGrade(srs, 'good', NOW);
      intervals.push(srs.intervalDays);
    }
    // Strictly increasing once past the fixed 1/6-day steps.
    for (let i = 3; i < intervals.length; i++) {
      const current = intervals[i];
      const previous = intervals[i - 1];
      expect(current).toBeGreaterThan(previous as number);
    }
  });
});

describe('applyGrade — hard', () => {
  it('reduces ease by 0.15', () => {
    const result = applyGrade(initialSrs(NOW), 'hard', NOW);
    expect(result.ease).toBeCloseTo(EASE_START - 0.15, 5);
  });

  it('first hard rep is due in 1 day (cannot shrink from a zero interval)', () => {
    const result = applyGrade(initialSrs(NOW), 'hard', NOW);
    expect(result.intervalDays).toBe(1);
  });

  it('multiplies a mature interval by 1.2, not by ease', () => {
    let srs: SrsInput = initialSrs(NOW);
    srs = applyGrade(srs, 'good', NOW);
    srs = applyGrade(srs, 'good', NOW);
    srs = applyGrade(srs, 'good', NOW); // now at reps=3, interval=6*2.5=15
    const hard = applyGrade(srs, 'hard', NOW);
    expect(hard.intervalDays).toBe(Math.max(1, Math.round(15 * 1.2)));
  });

  it('never reduces ease below the floor even after repeated hard grades', () => {
    let srs: SrsInput = initialSrs(NOW);
    for (let i = 0; i < 50; i++) {
      srs = applyGrade(srs, 'hard', NOW);
    }
    expect(srs.ease).toBeGreaterThanOrEqual(EASE_FLOOR);
    expect(srs.ease).toBeCloseTo(EASE_FLOOR, 5);
  });

  it('does not touch lapses', () => {
    const result = applyGrade(initialSrs(NOW), 'hard', NOW);
    expect(result.lapses).toBe(0);
  });
});

describe('applyGrade — again (lapse)', () => {
  it('resets reps to 0', () => {
    let srs: SrsInput = initialSrs(NOW);
    srs = applyGrade(srs, 'good', NOW);
    srs = applyGrade(srs, 'good', NOW);
    srs = applyGrade(srs, 'good', NOW);
    expect(srs.reps).toBe(3);
    const lapsed = applyGrade(srs, 'again', NOW);
    expect(lapsed.reps).toBe(0);
  });

  it('increments lapses by exactly 1 per again grade', () => {
    let srs: SrsInput = initialSrs(NOW);
    srs = applyGrade(srs, 'again', NOW);
    expect(srs.lapses).toBe(1);
    srs = applyGrade(srs, 'good', NOW);
    srs = applyGrade(srs, 'again', NOW);
    expect(srs.lapses).toBe(2);
  });

  it('reduces ease by 0.20', () => {
    const result = applyGrade(initialSrs(NOW), 'again', NOW);
    expect(result.ease).toBeCloseTo(EASE_START - 0.2, 5);
  });

  it('sets a short 1-day interval regardless of how mature the card was', () => {
    let srs: SrsInput = initialSrs(NOW);
    for (let i = 0; i < 6; i++) srs = applyGrade(srs, 'good', NOW);
    expect(srs.intervalDays).toBeGreaterThan(30);
    const lapsed = applyGrade(srs, 'again', NOW);
    expect(lapsed.intervalDays).toBe(1);
  });

  it('never reduces ease below the floor even after many consecutive lapses', () => {
    let srs: SrsInput = initialSrs(NOW);
    for (let i = 0; i < 50; i++) {
      srs = applyGrade(srs, 'again', NOW);
    }
    expect(srs.ease).toBeGreaterThanOrEqual(EASE_FLOOR);
    expect(srs.ease).toBeCloseTo(EASE_FLOOR, 5);
    // Floor holding doesn't freeze the lapse counter — that keeps counting
    // every single time, unlike ease.
    expect(srs.lapses).toBe(50);
  });

  it('a lapse followed by a good grade behaves like a fresh card at reps=1, not a continuation of the old streak', () => {
    let srs: SrsInput = initialSrs(NOW);
    for (let i = 0; i < 5; i++) srs = applyGrade(srs, 'good', NOW); // mature, large interval
    srs = applyGrade(srs, 'again', NOW);
    const recovered = applyGrade(srs, 'good', NOW);
    expect(recovered.reps).toBe(1);
    expect(recovered.intervalDays).toBe(1);
  });
});

describe('applyGrade — easy', () => {
  it('increases ease by 0.15', () => {
    const result = applyGrade(initialSrs(NOW), 'easy', NOW);
    expect(result.ease).toBeCloseTo(EASE_START + 0.15, 5);
  });

  it('first easy rep jumps straight to 4 days', () => {
    const result = applyGrade(initialSrs(NOW), 'easy', NOW);
    expect(result.intervalDays).toBe(4);
  });

  it('later easy reps apply a 1.3x bonus on top of the ease multiplier', () => {
    let srs: SrsInput = initialSrs(NOW);
    srs = applyGrade(srs, 'good', NOW);
    srs = applyGrade(srs, 'good', NOW); // reps=2, interval=6, ease=2.5
    const easy = applyGrade(srs, 'easy', NOW);
    const expectedEase = EASE_START + 0.15;
    expect(easy.ease).toBeCloseTo(expectedEase, 5);
    expect(easy.intervalDays).toBe(Math.round(6 * expectedEase * 1.3));
  });

  it('produces a longer interval than an equivalent good grade from the same state', () => {
    let goodSrs: SrsInput = initialSrs(NOW);
    goodSrs = applyGrade(goodSrs, 'good', NOW);
    goodSrs = applyGrade(goodSrs, 'good', NOW);
    let easySrs: SrsInput = initialSrs(NOW);
    easySrs = applyGrade(easySrs, 'good', NOW);
    easySrs = applyGrade(easySrs, 'good', NOW);

    const goodNext = applyGrade(goodSrs, 'good', NOW);
    const easyNext = applyGrade(easySrs, 'easy', NOW);
    expect(easyNext.intervalDays).toBeGreaterThan(goodNext.intervalDays);
  });
});

describe('dueAt', () => {
  it('is always now + intervalDays, in whole days', () => {
    const result = applyGrade(initialSrs(NOW), 'good', NOW);
    expect(result.dueAt.getTime()).toBe(NOW.getTime() + 1 * DAY_MS);
  });
});
