import type { PreparedPage } from './prepare';

export interface Chunk {
  index: number;
  startPage: number;
  endPage: number;
  text: string;
  // How many pages at the start of this chunk were also the tail of the
  // previous chunk (docs/studysheet-build-prompt.md §7: "1-page overlap so
  // concepts aren't cut mid-explanation"). 0 for the first chunk.
  overlapsPreviousBy: number;
}

const MIN_PAGES = 8;
const MAX_PAGES = 15;
const TARGET_TOKENS = 15_000;
const OVERLAP_PAGES = 1;

// Rough heuristic for chunk-boundary decisions only — real token/cost
// accounting always comes from the API response's usage field, never this
// estimate (see ai/client.ts).
const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// Groups prepared pages into chunks of 8–15 pages (or ~15k estimated
// tokens, whichever comes first), preferring to cut right before a detected
// heading once the minimum size is met — "heading-aware" per
// docs/studysheet-milestones.md M2 — with a 1-page overlap between
// consecutive chunks.
export function chunkPages(pages: PreparedPage[]): Chunk[] {
  if (pages.length === 0) return [];
  const sorted = [...pages].sort((a, b) => a.page - b.page);

  const chunks: Chunk[] = [];
  let startIdx = 0;

  while (startIdx < sorted.length) {
    let endIdx = startIdx;
    let tokenCount = estimateTokens(sorted[startIdx]?.text ?? '');

    while (endIdx + 1 < sorted.length) {
      const pageCount = endIdx - startIdx + 1;
      const nextPage = sorted[endIdx + 1];
      if (pageCount >= MAX_PAGES) break;
      if (pageCount >= MIN_PAGES && (tokenCount >= TARGET_TOKENS || nextPage?.startsWithHeading)) {
        break;
      }
      endIdx++;
      tokenCount += estimateTokens(sorted[endIdx]?.text ?? '');
    }

    const slice = sorted.slice(startIdx, endIdx + 1);
    const first = slice[0];
    const last = slice[slice.length - 1];
    if (!first || !last) break; // unreachable: slice is never empty here

    chunks.push({
      index: chunks.length,
      startPage: first.page,
      endPage: last.page,
      // Page markers are baked in here (not left to the map stage to infer)
      // so the model can attribute every extracted item to a real page.
      text: slice.map((p) => `[page ${p.page}]\n${p.text}`).join('\n\n'),
      overlapsPreviousBy: chunks.length === 0 ? 0 : Math.min(OVERLAP_PAGES, slice.length),
    });

    const isLastChunk = endIdx === sorted.length - 1;
    if (isLastChunk) break;

    // Always make forward progress by at least one page, even if the
    // overlap would otherwise stall the loop on a very small remaining tail.
    startIdx = Math.max(startIdx + 1, endIdx + 1 - OVERLAP_PAGES);
  }

  return chunks;
}
