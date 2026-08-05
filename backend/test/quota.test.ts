import { describe, it, expect } from 'vitest';
import { periodFor, estimateCostCents, canReserve, PLAN_ALLOWANCES } from '../src/pipeline/quota';

describe('periodFor', () => {
  it("is the constant 'lifetime' for the free plan — a one-time allowance, never renewed by the calendar", () => {
    expect(periodFor('free', new Date('2026-08-04'))).toBe('lifetime');
    expect(periodFor('free', new Date('2027-01-01'))).toBe('lifetime');
  });

  it('is the calendar month for paid plans, resetting across a month boundary', () => {
    expect(periodFor('student', new Date('2026-08-04T12:00:00Z'))).toBe('2026-08');
    expect(periodFor('pro', new Date('2026-01-31T23:59:59Z'))).toBe('2026-01');
    expect(periodFor('semester', new Date('2026-12-01T00:00:00Z'))).toBe('2026-12');
  });
});

describe('estimateCostCents', () => {
  it('matches §12: $0.004/page typed, $0.014/page vision', () => {
    expect(estimateCostCents(100, 0)).toBe(40);
    expect(estimateCostCents(0, 100)).toBe(140);
  });

  it('sums mixed text and vision pages', () => {
    expect(estimateCostCents(50, 50)).toBe(Math.round(50 * 0.4 + 50 * 1.4));
  });

  it('is zero for an empty document', () => {
    expect(estimateCostCents(0, 0)).toBe(0);
  });
});

describe('canReserve', () => {
  it('allows a request that exactly fills the remaining allowance', () => {
    expect(canReserve({ allowance: 30, used: 10, reserved: 10, requested: 10 })).toBe(true);
  });

  it('rejects a request that would exceed the allowance by even one page', () => {
    expect(canReserve({ allowance: 30, used: 10, reserved: 10, requested: 11 })).toBe(false);
  });

  it('rejects when used+reserved alone already meets the allowance', () => {
    expect(canReserve({ allowance: 30, used: 30, reserved: 0, requested: 1 })).toBe(false);
  });
});

describe('PLAN_ALLOWANCES', () => {
  it('matches §12\'s tiers table for the plans reachable without M10 billing', () => {
    expect(PLAN_ALLOWANCES.student).toBe(500);
    expect(PLAN_ALLOWANCES.pro).toBe(1500);
    expect(PLAN_ALLOWANCES.semester).toBe(2000);
  });
});
