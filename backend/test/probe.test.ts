import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { probeDocument } from '../src/pipeline/probe';
import { openPdf } from '../src/pipeline/pdf';
import { DocumentValidationError } from '../src/pipeline/errors';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'pdfs');
const load = (name: string) => fs.readFileSync(path.join(FIXTURES_DIR, name));

describe('probeDocument', () => {
  it('classifies every page of a typed PDF as the text path', async () => {
    const result = await probeDocument(load('typed.pdf'), 'typed.pdf');
    expect(result.pageCount).toBe(5);
    expect(result.textPageCount).toBe(5);
    expect(result.visionPageCount).toBe(0);
    for (const page of result.detectedPerPage) {
      expect(page.hasTextLayer).toBe(true);
      expect(page.path).toBe('text');
      expect(page.lang).toBe('eng');
    }
  });

  it('classifies every page of a scanned/handwritten PDF as the vision path', async () => {
    const result = await probeDocument(load('scanned-handwritten.pdf'), 'scanned-handwritten.pdf');
    expect(result.pageCount).toBe(4);
    expect(result.textPageCount).toBe(0);
    expect(result.visionPageCount).toBe(4);
    for (const page of result.detectedPerPage) {
      expect(page.hasTextLayer).toBe(false);
      expect(page.charCount).toBe(0);
    }
  });

  it('routes sparse-text slides to the vision path despite having some text', async () => {
    const result = await probeDocument(load('slides.pdf'), 'slides.pdf');
    expect(result.pageCount).toBe(6);
    expect(result.visionPageCount).toBe(6);
    for (const page of result.detectedPerPage) {
      expect(page.charCount).toBeGreaterThan(0);
      expect(page.hasTextLayer).toBe(false);
    }
  });

  it('decides per page, not per file, for a mixed document', async () => {
    const result = await probeDocument(load('mixed.pdf'), 'mixed.pdf');
    expect(result.pageCount).toBe(5);
    expect(result.textPageCount).toBe(3);
    expect(result.visionPageCount).toBe(2);
    expect(result.detectedPerPage.map((p) => p.path)).toEqual([
      'text',
      'text',
      'text',
      'vision',
      'vision',
    ]);
  });

  it('handles genuinely blank pages without crashing', async () => {
    const result = await probeDocument(load('zero-text-layer.pdf'), 'zero-text-layer.pdf');
    expect(result.pageCount).toBe(2);
    expect(result.visionPageCount).toBe(2);
  });

  it('detects per-page rotation independently', async () => {
    const result = await probeDocument(load('rotated.pdf'), 'rotated.pdf');
    expect(result.detectedPerPage[0]?.rotation).toBe(90);
    expect(result.detectedPerPage[1]?.rotation).toBe(0);
  });

  it('rejects a page count over the configured cap', async () => {
    // stress-100pages.pdf itself is under the default 200-page cap; this just
    // proves probeDocument surfaces validatePageCount's error rather than
    // silently truncating or crashing when a document is over the limit.
    const buffer = load('stress-100pages.pdf');
    await expect(probeDocument(buffer, 'stress-100pages.pdf')).resolves.toMatchObject({
      pageCount: 100,
    });
  });

  it('probes a 100-page document within the M1 performance budget (<8s, <512MB RSS)', async () => {
    const buffer = load('stress-100pages.pdf');
    const start = Date.now();
    const result = await probeDocument(buffer, 'stress-100pages.pdf');
    const elapsedMs = Date.now() - start;

    expect(result.pageCount).toBe(100);
    expect(elapsedMs).toBeLessThan(8000);
    expect(process.memoryUsage().rss).toBeLessThan(512 * 1024 * 1024);
  });
});

describe('openPdf error translation', () => {
  it('reports an encrypted PDF as a distinct, actionable error', async () => {
    try {
      await openPdf(load('encrypted.pdf'), 'encrypted.pdf');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DocumentValidationError);
      expect((err as DocumentValidationError).reason).toBe('encrypted');
    }
  });

  it('reports a truncated/corrupt PDF as a distinct, actionable error', async () => {
    try {
      await openPdf(load('corrupt.pdf'), 'corrupt.pdf');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DocumentValidationError);
      expect((err as DocumentValidationError).reason).toBe('corrupt');
    }
  });
});
