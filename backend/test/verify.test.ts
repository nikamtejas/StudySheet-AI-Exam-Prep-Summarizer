import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

vi.mock('../src/config/env', () => ({
  env: { ANTHROPIC_API_KEY: 'test-key' },
}));

import { solveOne, answersAgree } from '../src/pipeline/verify';
import type { SolvedProblem } from '../src/contracts';

function textResponse(payload: unknown, inputTokens = 100, outputTokens = 50) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

function makeSolved(answerValue: string, units?: string): SolvedProblem {
  return {
    problem: 'Solve for x: 2x = 10',
    subject: 'math',
    given: ['2x = 10'],
    goal: 'Find x',
    strategy: 'Divide both sides by 2',
    steps: [{ n: 1, action: 'Divide both sides by 2', math: 'x = 5', why: 'Isolates x on one side' }],
    answer: units ? { value: answerValue, units } : { value: answerValue },
    check: 'Substitute back: 2(5) = 10 ✓',
    commonMistake: 'Forgetting to divide both sides by the same factor',
    memoryHook: 'A balance scale: whatever you do, do it to both sides',
  };
}

describe('answersAgree', () => {
  it('agrees on numerically-equal values expressed differently', () => {
    expect(answersAgree({ value: '0.5' }, { value: '1/2' })).toBe(true);
  });

  it('disagrees on genuinely different numbers', () => {
    expect(answersAgree({ value: '5' }, { value: '6' })).toBe(false);
  });

  it('agrees across compatible units after conversion', () => {
    expect(answersAgree({ value: '5', units: 'm/s' }, { value: '18', units: 'km/h' })).toBe(true);
  });

  it('fails on dimensional mismatch even when the raw numbers match', () => {
    expect(answersAgree({ value: '5', units: 'm' }, { value: '5', units: 's' })).toBe(false);
  });

  it('falls back to normalized string comparison for non-numeric (symbolic) answers', () => {
    expect(answersAgree({ value: 'x^2 + 1' }, { value: 'x^2+1' })).toBe(true);
    expect(answersAgree({ value: 'x^2 + 1' }, { value: 'x^2 + 2' })).toBe(false);
  });

  it('falls back to a plain numeric compare when a unit string is not a real physical unit', () => {
    expect(answersAgree({ value: '5', units: 'items' }, { value: '5', units: 'items' })).toBe(true);
    expect(answersAgree({ value: '5', units: 'items' }, { value: '6', units: 'items' })).toBe(false);
  });
});

describe('solveOne', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('verifies when the first two independent attempts agree — no third call needed', async () => {
    mockCreate
      .mockResolvedValueOnce(textResponse(makeSolved('5')))
      .mockResolvedValueOnce(textResponse(makeSolved('5')));

    const result = await solveOne({ statement: '2x=10', pageRef: 3 });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.data.verified).toBe(true);
    expect(result.data.pageRef).toBe(3);
    expect(result.data.answer.value).toBe('5');
    expect(result.data.verificationNote).toBeUndefined();
  });

  it('runs a third attempt on disagreement and ships the majority answer', async () => {
    mockCreate
      .mockResolvedValueOnce(textResponse(makeSolved('5')))
      .mockResolvedValueOnce(textResponse(makeSolved('6')))
      .mockResolvedValueOnce(textResponse(makeSolved('5')));

    const result = await solveOne({ statement: '2x=10', pageRef: 1 });

    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(result.data.verified).toBe(true);
    expect(result.data.answer.value).toBe('5');
  });

  it('marks the problem visibly unverified — never dropped — when all three attempts disagree', async () => {
    mockCreate
      .mockResolvedValueOnce(textResponse(makeSolved('5')))
      .mockResolvedValueOnce(textResponse(makeSolved('6')))
      .mockResolvedValueOnce(textResponse(makeSolved('7')));

    const result = await solveOne({ statement: '2x=10', pageRef: 1 });

    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(result.data.verified).toBe(false);
    expect(result.data.verificationNote).toMatch(/unverified/i);
    // The full solved payload survives — a failed verification degrades
    // visibility, it never deletes the answer (reliability invariant 5).
    expect(result.data.answer.value).toBe('5');
    expect(result.data.steps.length).toBeGreaterThan(0);
  });

  it('fails verification on a dimensional mismatch between the two agreeing-by-number attempts', async () => {
    mockCreate
      .mockResolvedValueOnce(textResponse(makeSolved('5', 'm')))
      .mockResolvedValueOnce(textResponse(makeSolved('5', 's')))
      .mockResolvedValueOnce(textResponse(makeSolved('5', 'm')));

    const result = await solveOne({ statement: 'How far?', pageRef: 2 });

    // First two "agree" numerically but not dimensionally, so a third
    // attempt runs; it agrees with attempt 1's units, so that pair wins.
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(result.data.verified).toBe(true);
    expect(result.data.answer.units).toBe('m');
  });
});
