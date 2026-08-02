import path from 'node:path';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import { DocumentValidationError } from './errors';

// pdfjs-dist's Node ("legacy") build only ships as ESM. The backend is
// CommonJS, so it's loaded via a cached dynamic import rather than a static
// one — this is the one file that has to bridge that gap.
type PdfjsLib = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsPromise: Promise<PdfjsLib> | null = null;

function getPdfjs(): Promise<PdfjsLib> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsPromise;
}

const STANDARD_FONT_DATA_URL = path.join(
  path.dirname(require.resolve('pdfjs-dist/package.json')),
  'standard_fonts',
  path.sep,
);

export type { PDFDocumentProxy };

// Opens a PDF for structural analysis (page count, text content, rotation).
// Deliberately never renders a page — see docs/studysheet-milestones.md M1:
// rasterization for the vision path goes through poppler (pipeline/rasterize.ts)
// instead, because pdfjs-dist's Node canvas rendering path is fragile across
// canvas-library versions, while its parsing/text-extraction path is not.
export async function openPdf(buffer: Buffer, filename: string): Promise<PDFDocumentProxy> {
  const pdfjsLib = await getPdfjs();
  try {
    return await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      isEvalSupported: false,
    }).promise;
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'PasswordException') {
      throw new DocumentValidationError(
        'encrypted',
        `"${filename}" is password-protected. Remove the password and re-upload.`,
      );
    }
    throw new DocumentValidationError(
      'corrupt',
      `"${filename}" couldn't be read as a PDF — it may be corrupt or truncated.`,
    );
  }
}
