import { env } from '../config/env';
import { DocumentValidationError } from './errors';

const PDF_MAGIC = '%PDF-';
const MAGIC_SEARCH_WINDOW = 1024;

// MIME sniffing, not extension — a renamed .txt/.png must not sail through
// just because someone called it document.pdf (docs/studysheet-milestones.md M1).
export function looksLikePdf(buffer: Buffer): boolean {
  return buffer.subarray(0, MAGIC_SEARCH_WINDOW).toString('latin1').includes(PDF_MAGIC);
}

export function validateFileBasics(buffer: Buffer, filename: string): void {
  if (!looksLikePdf(buffer)) {
    throw new DocumentValidationError(
      'not_a_pdf',
      `"${filename}" doesn't look like a PDF — no %PDF- signature found in the file.`,
    );
  }

  const maxBytes = env.MAX_FILE_MB * 1024 * 1024;
  if (buffer.byteLength > maxBytes) {
    const sizeMb = (buffer.byteLength / 1024 / 1024).toFixed(1);
    throw new DocumentValidationError(
      'too_large',
      `"${filename}" is ${sizeMb}MB, over the ${env.MAX_FILE_MB}MB limit.`,
    );
  }
}

export function validatePageCount(pageCount: number, filename: string): void {
  if (pageCount > env.MAX_PAGES_PER_JOB) {
    throw new DocumentValidationError(
      'too_many_pages',
      `"${filename}" has ${pageCount} pages, over the ${env.MAX_PAGES_PER_JOB}-page limit.`,
    );
  }
}
