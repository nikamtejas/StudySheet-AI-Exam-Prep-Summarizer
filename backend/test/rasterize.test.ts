import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { rasterizePages } from '../src/pipeline/rasterize';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'pdfs');
const load = (name: string) => fs.readFileSync(path.join(FIXTURES_DIR, name));

function isJpeg(buffer: Buffer): boolean {
  return buffer[0] === 0xff && buffer[1] === 0xd8;
}

describe('rasterizePages', () => {
  it('returns an empty array when no pages are requested', async () => {
    const result = await rasterizePages(load('scanned-handwritten.pdf'), []);
    expect(result).toEqual([]);
  });

  it('rasterizes a contiguous run of pages to JPEG', async () => {
    const result = await rasterizePages(load('scanned-handwritten.pdf'), [1, 2, 3]);
    expect(result.map((r) => r.page)).toEqual([1, 2, 3]);
    for (const r of result) {
      expect(isJpeg(r.jpegBuffer)).toBe(true);
      expect(r.jpegBuffer.byteLength).toBeGreaterThan(0);
    }
  });

  it('rasterizes non-contiguous pages correctly', async () => {
    const result = await rasterizePages(load('mixed.pdf'), [1, 4]);
    expect(result.map((r) => r.page)).toEqual([1, 4]);
    for (const r of result) {
      expect(isJpeg(r.jpegBuffer)).toBe(true);
    }
  });

  it('works for a document large enough to need zero-padded poppler filenames', async () => {
    const result = await rasterizePages(load('stress-100pages.pdf'), [50]);
    expect(result.map((r) => r.page)).toEqual([50]);
    expect(isJpeg(result[0]?.jpegBuffer ?? Buffer.alloc(0))).toBe(true);
  });
});
