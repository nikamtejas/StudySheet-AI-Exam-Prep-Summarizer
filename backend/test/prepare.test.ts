import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { prepareText } from '../src/pipeline/prepare';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'pdfs');
const load = (name: string) => fs.readFileSync(path.join(FIXTURES_DIR, name));

describe('prepareText', () => {
  it('strips a repeated running header and a page-numbered footer, keeping unique body text', async () => {
    const prepared = await prepareText(load('lecture-with-header-footer.pdf'), 'lecture.pdf', [
      1, 2, 3, 4, 5,
    ]);

    expect(prepared).toHaveLength(5);
    for (const page of prepared) {
      expect(page.text).not.toContain('CS 301');
      expect(page.text).not.toMatch(/Page \d+ of \d+/);
      expect(page.text).toContain(`Lecture ${page.page}: unique topic for this page`);
      expect(page.text).toContain(`On page ${page.page} specifically`);
    }

    // Each page's retained body must actually differ — proves we didn't
    // over-strip down to a common skeleton.
    const bodies = prepared.map((p) => p.text);
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it('does not strip anything from a single-page document (nothing to compare against)', async () => {
    const prepared = await prepareText(load('typed.pdf'), 'typed.pdf', [1]);
    expect(prepared).toHaveLength(1);
    expect(prepared[0]?.text.length).toBeGreaterThan(0);
  });

  it('returns an empty array when no pages are requested', async () => {
    const prepared = await prepareText(load('typed.pdf'), 'typed.pdf', []);
    expect(prepared).toEqual([]);
  });
});
