import { describe, it, expect } from 'vitest';
import { chunkVisionPages, type VisionPageInput } from '../src/pipeline/chunkVision';

const TYPICAL_PAGE_BYTES = 130 * 1024; // ~130KB, matching real rasterized JPEGs observed in M1

function pages(count: number, sizeBytes = TYPICAL_PAGE_BYTES): VisionPageInput[] {
  return Array.from({ length: count }, (_, i) => ({ page: i + 1, sizeBytes }));
}

function coveredPages(batches: { pages: number[] }[]): number[] {
  return batches.flatMap((b) => b.pages);
}

describe('chunkVisionPages', () => {
  it('returns an empty array for no pages', () => {
    expect(chunkVisionPages([])).toEqual([]);
  });

  it('puts a small document in a single batch', () => {
    const batches = chunkVisionPages(pages(4));
    expect(batches).toHaveLength(1);
    expect(batches[0]?.pages).toEqual([1, 2, 3, 4]);
  });

  it('splits a 120-page document into clean 20-page batches with no gaps, overlaps, or duplicates', () => {
    const batches = chunkVisionPages(pages(120));

    expect(batches).toHaveLength(6);
    for (const batch of batches) {
      expect(batch.pages).toHaveLength(20);
    }

    const covered = coveredPages(batches);
    expect(covered).toEqual(Array.from({ length: 120 }, (_, i) => i + 1)); // exact sequence, no dup/gap
    expect(new Set(covered).size).toBe(120);
  });

  it('splits a 100-page document into exactly 5 batches of 20', () => {
    const batches = chunkVisionPages(pages(100));
    expect(batches).toHaveLength(5);
    expect(batches.every((b) => b.pages.length === 20)).toBe(true);
  });

  it('cuts a batch early if raw byte size would approach the request ceiling, even under 20 pages', () => {
    const bigPages = pages(20, 2 * 1024 * 1024); // 2MB/page — 20 pages would be 40MB, over the 24MB safety margin
    const batches = chunkVisionPages(bigPages);

    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      const totalBytes = batch.pages.length * 2 * 1024 * 1024;
      expect(totalBytes).toBeLessThanOrEqual(24 * 1024 * 1024);
    }
    expect(coveredPages(batches)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('sorts out-of-order page input before batching', () => {
    const shuffled: VisionPageInput[] = [
      { page: 3, sizeBytes: TYPICAL_PAGE_BYTES },
      { page: 1, sizeBytes: TYPICAL_PAGE_BYTES },
      { page: 2, sizeBytes: TYPICAL_PAGE_BYTES },
    ];
    const batches = chunkVisionPages(shuffled);
    expect(batches[0]?.pages).toEqual([1, 2, 3]);
  });
});
