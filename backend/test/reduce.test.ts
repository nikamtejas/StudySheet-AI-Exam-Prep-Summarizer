import { describe, it, expect } from 'vitest';
import { reduceChunks } from '../src/pipeline/reduce';
import type { ChunkExtraction } from '../src/pipeline/map';

function chunk(overrides: Partial<ChunkExtraction> = {}): ChunkExtraction {
  return {
    definitions: [],
    keyPoints: [],
    formulas: [],
    problems: [],
    pageRefs: [],
    unreadablePages: [],
    ...overrides,
  };
}

describe('reduceChunks', () => {
  it('returns empty collections for no chunks', () => {
    const result = reduceChunks([]);
    expect(result).toEqual({
      definitions: [],
      keyPoints: [],
      formulas: [],
      problems: [],
      pageRefs: [],
      unreadablePages: [],
    });
  });

  it('dedupes definitions by normalized term and counts mentions across chunks', () => {
    const result = reduceChunks([
      chunk({ definitions: [{ term: 'Entropy', definition: 'A measure of disorder.', pageRef: 3 }] }),
      chunk({ definitions: [{ term: 'entropy', definition: 'Disorder measure (restated).', pageRef: 9 }] }),
      chunk({ definitions: [{ term: 'Enthalpy', definition: 'Heat content.', pageRef: 4 }] }),
    ]);

    expect(result.definitions).toHaveLength(2);
    const entropy = result.definitions.find((d) => d.term.toLowerCase() === 'entropy');
    expect(entropy?.mentionCount).toBe(2);
    // First occurrence's text wins (usually the more precisely quoted one from the earlier chunk).
    expect(entropy?.definition).toBe('A measure of disorder.');
  });

  it('ranks definitions and key points by mention count, most-mentioned first', () => {
    const result = reduceChunks([
      chunk({ definitions: [{ term: 'Rare term', definition: 'x', pageRef: 1 }] }),
      chunk({ definitions: [{ term: 'Common term', definition: 'y', pageRef: 2 }] }),
      chunk({ definitions: [{ term: 'Common term', definition: 'y', pageRef: 2 }] }),
      chunk({ definitions: [{ term: 'Common term', definition: 'y', pageRef: 2 }] }),
    ]);

    expect(result.definitions[0]?.term).toBe('Common term');
    expect(result.definitions[0]?.mentionCount).toBe(3);
    expect(result.definitions[1]?.term).toBe('Rare term');
  });

  it('dedupes formulas and problems by normalized text without needing mention counts', () => {
    const result = reduceChunks([
      chunk({ formulas: [{ expression: 'E = mc^2', description: 'Mass-energy equivalence', pageRef: 5 }] }),
      chunk({ formulas: [{ expression: 'e = mc^2', description: 'Same formula restated', pageRef: 11 }] }),
      chunk({ problems: [{ statement: 'Solve for x in 2x + 3 = 7', pageRef: 6 }] }),
    ]);

    expect(result.formulas).toHaveLength(1);
    expect(result.problems).toHaveLength(1);
  });

  it('merges and sorts page references across all chunks', () => {
    const result = reduceChunks([
      chunk({ pageRefs: [3, 1, 2] }),
      chunk({ pageRefs: [2, 4] }),
    ]);
    expect(result.pageRefs).toEqual([1, 2, 3, 4]);
  });

  it('merges unreadable pages across chunks, deduped and sorted', () => {
    const result = reduceChunks([
      chunk({ unreadablePages: [5, 2] }),
      chunk({ unreadablePages: [2, 8] }),
    ]);
    expect(result.unreadablePages).toEqual([2, 5, 8]);
  });
});
