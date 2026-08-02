import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { looksLikePdf, validateFileBasics, validatePageCount } from '../src/pipeline/validate';
import { DocumentValidationError } from '../src/pipeline/errors';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'pdfs');
const load = (name: string) => fs.readFileSync(path.join(FIXTURES_DIR, name));

describe('looksLikePdf', () => {
  it('accepts a real PDF', () => {
    expect(looksLikePdf(load('typed.pdf'))).toBe(true);
  });

  it('rejects a file that is not a PDF, regardless of its name', () => {
    expect(looksLikePdf(load('not-a-pdf.pdf'))).toBe(false);
  });
});

describe('validateFileBasics', () => {
  it('passes for a real PDF under the size cap', () => {
    expect(() => validateFileBasics(load('typed.pdf'), 'typed.pdf')).not.toThrow();
  });

  it('rejects a non-PDF file sniffed by content, not extension', () => {
    try {
      validateFileBasics(load('not-a-pdf.pdf'), 'not-a-pdf.pdf');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DocumentValidationError);
      expect((err as DocumentValidationError).reason).toBe('not_a_pdf');
    }
  });

  it('rejects a file over the size cap', () => {
    const oversized = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(40 * 1024 * 1024)]);
    try {
      validateFileBasics(oversized, 'huge.pdf');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DocumentValidationError);
      expect((err as DocumentValidationError).reason).toBe('too_large');
    }
  });
});

describe('validatePageCount', () => {
  it('passes under the page cap', () => {
    expect(() => validatePageCount(100, 'doc.pdf')).not.toThrow();
  });

  it('rejects over the page cap', () => {
    try {
      validatePageCount(500, 'doc.pdf');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DocumentValidationError);
      expect((err as DocumentValidationError).reason).toBe('too_many_pages');
    }
  });
});
