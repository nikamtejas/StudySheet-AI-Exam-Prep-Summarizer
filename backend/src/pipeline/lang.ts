// franc-min is ESM-only; the backend is CommonJS, so it's loaded via a cached
// dynamic import (same pattern as pipeline/pdf.ts for pdfjs-dist).
type FrancModule = typeof import('franc-min');

let francPromise: Promise<FrancModule> | null = null;

function getFranc(): Promise<FrancModule> {
  if (!francPromise) {
    francPromise = import('franc-min');
  }
  return francPromise;
}

// franc needs a reasonable amount of text to guess reliably; below this it
// returns 'und' (undetermined) anyway, so skip the call entirely.
const MIN_CHARS_FOR_DETECTION = 20;

// Returns an ISO 639-3 code (e.g. 'eng'), or null when there isn't enough
// text to guess from.
export async function detectLanguage(text: string): Promise<string | null> {
  if (text.trim().length < MIN_CHARS_FOR_DETECTION) return null;
  const { franc } = await getFranc();
  const code = franc(text);
  return code === 'und' ? null : code;
}
