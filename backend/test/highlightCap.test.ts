import { describe, it, expect } from 'vitest';
import { enforceHighlightCap } from '../src/pipeline/highlightCap';
import type { Section } from '../src/contracts';

function section(body: string, highlights: Section['highlights']): Section {
  return { type: 'core-concepts', title: 'Test', body, highlights };
}

describe('enforceHighlightCap', () => {
  it('leaves a section unchanged when highlighted text is within the 15% cap', () => {
    const body = 'x'.repeat(100);
    const sections = [section(body, [{ text: 'x'.repeat(10), kind: 'definition', pageRef: 1 }])];

    const result = enforceHighlightCap(sections);

    expect(result[0]?.highlights).toHaveLength(1);
  });

  it('drops highlights until the ratio is at or under 15% when over the cap', () => {
    const body = 'x'.repeat(100);
    const sections = [
      section(body, [
        { text: 'x'.repeat(30), kind: 'definition', pageRef: 1 },
        { text: 'x'.repeat(30), kind: 'definition', pageRef: 2 },
      ]),
    ];

    const result = enforceHighlightCap(sections);

    const remainingLength = result[0]!.highlights.reduce((sum, h) => sum + h.text.length, 0);
    expect(remainingLength / body.length).toBeLessThanOrEqual(0.15);
  });

  it('drops definition highlights before exam-critical ones', () => {
    const body = 'x'.repeat(100);
    // Dropping just the 10-char definition mark alone gets to 10/100 = 10%,
    // under the 15% cap — so the exam-critical mark should survive intact.
    const sections = [
      section(body, [
        { text: 'a'.repeat(10), kind: 'definition', pageRef: 1 },
        { text: 'b'.repeat(10), kind: 'exam-critical', pageRef: 2 },
      ]),
    ];

    const result = enforceHighlightCap(sections);

    expect(result[0]!.highlights.some((h) => h.kind === 'exam-critical')).toBe(true);
    expect(result[0]!.highlights.some((h) => h.text === 'a'.repeat(10))).toBe(false);
  });

  it('drops longer highlights before shorter ones within the same kind', () => {
    const body = 'x'.repeat(100);
    const sections = [
      section(body, [
        { text: 'a'.repeat(25), kind: 'definition', pageRef: 1 },
        { text: 'b'.repeat(5), kind: 'definition', pageRef: 2 },
      ]),
    ];

    const result = enforceHighlightCap(sections);

    expect(result[0]!.highlights.some((h) => h.text === 'b'.repeat(5))).toBe(true);
    expect(result[0]!.highlights.some((h) => h.text === 'a'.repeat(25))).toBe(false);
  });

  it('never mutates the input sections array', () => {
    const original = [section('x'.repeat(100), [{ text: 'x'.repeat(50), kind: 'definition', pageRef: 1 }])];
    const snapshot = JSON.parse(JSON.stringify(original));

    enforceHighlightCap(original);

    expect(original).toEqual(snapshot);
  });

  it('handles sections with no highlights at all', () => {
    const sections = [section('some body text', [])];
    const result = enforceHighlightCap(sections);
    expect(result[0]?.highlights).toEqual([]);
  });
});
