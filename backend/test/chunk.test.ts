import { describe, it, expect } from 'vitest';
import { chunkPages } from '../src/pipeline/chunk';
import type { PreparedPage } from '../src/pipeline/prepare';

function page(n: number, opts: { text?: string; heading?: boolean } = {}): PreparedPage {
  return {
    page: n,
    text: opts.text ?? `Page ${n} body text.`,
    startsWithHeading: opts.heading ?? false,
  };
}

describe('chunkPages', () => {
  it('returns an empty array for no pages', () => {
    expect(chunkPages([])).toEqual([]);
  });

  it('puts a short document (under the 8-page minimum) into a single chunk', () => {
    const pages = Array.from({ length: 5 }, (_, i) => page(i + 1));
    const chunks = chunkPages(pages);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ startPage: 1, endPage: 5, overlapsPreviousBy: 0 });
  });

  it('caps a long, low-density document at 15 pages per chunk with a 1-page overlap', () => {
    const pages = Array.from({ length: 40 }, (_, i) => page(i + 1, { text: 'short.' }));
    const chunks = chunkPages(pages);

    for (const chunk of chunks) {
      const pageCount = chunk.endPage - chunk.startPage + 1;
      expect(pageCount).toBeLessThanOrEqual(15);
    }

    // Every chunk after the first overlaps the previous chunk's last page.
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]!;
      const curr = chunks[i]!;
      expect(curr.overlapsPreviousBy).toBe(1);
      expect(curr.startPage).toBe(prev.endPage);
    }

    // Every source page must appear in at least one chunk (overlap means
    // some appear in two, never zero).
    const covered = new Set<number>();
    for (const chunk of chunks) {
      for (let p = chunk.startPage; p <= chunk.endPage; p++) covered.add(p);
    }
    expect(covered.size).toBe(40);
  });

  it('cuts early once the ~15k token target is reached, even under 15 pages', () => {
    const bigText = 'x'.repeat(8000); // ~2000 estimated tokens per page
    const pages = Array.from({ length: 20 }, (_, i) => page(i + 1, { text: bigText }));
    const chunks = chunkPages(pages);

    expect(chunks[0]!.endPage - chunks[0]!.startPage + 1).toBeLessThan(15);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('prefers cutting right before a detected heading once the 8-page minimum is met', () => {
    const pages = Array.from({ length: 20 }, (_, i) => page(i + 1));
    pages[9] = page(10, { heading: true }); // page 10 starts a new topic

    const chunks = chunkPages(pages);

    expect(chunks[0]!.endPage).toBe(9); // cuts right before the heading page
    expect(chunks[1]!.startPage).toBe(9); // 1-page overlap carries page 9 forward
  });

  it('does not cut on a heading before the 8-page minimum is met', () => {
    const pages = Array.from({ length: 20 }, (_, i) => page(i + 1));
    pages[2] = page(3, { heading: true }); // too early to act on

    const chunks = chunkPages(pages);

    expect(chunks[0]!.endPage).toBeGreaterThanOrEqual(8);
  });
});
