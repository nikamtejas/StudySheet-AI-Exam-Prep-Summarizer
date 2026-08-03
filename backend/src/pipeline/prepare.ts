import { extractPagesText, type TextLine } from './extract';

export interface PreparedPage {
  page: number;
  text: string;
  // True when the first surviving line looks like a heading (a font
  // noticeably larger than the page's own body text, and short) — lets
  // pipeline/chunk.ts prefer cutting chunks at topic boundaries.
  startsWithHeading: boolean;
}

const HEADING_FONT_RATIO = 1.15;
const HEADING_MAX_CHARS = 80;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

function looksLikeHeading(line: TextLine | undefined, bodyFontSize: number): boolean {
  if (!line || bodyFontSize <= 0) return false;
  return line.fontSize >= bodyFontSize * HEADING_FONT_RATIO && line.text.length <= HEADING_MAX_CHARS;
}

// A line counts as a header/footer candidate only within this fraction of a
// page's lines (top and bottom), capped at 3 — keeps short pages from having
// their entire content treated as a header band.
const MAX_BAND_LINES = 3;
const BAND_FRACTION = 0.2;
const REPETITION_THRESHOLD = 0.6;

function normalize(text: string): string {
  // Page numbers vary per page ("Page 3 of 40") — collapse digit runs so
  // the pattern still matches across pages despite the differing number.
  return text.trim().toLowerCase().replace(/\d+/g, '#');
}

// Strips lines that repeat across a configurable share of pages — running
// headers, footers, and page-number lines — per
// docs/studysheet-milestones.md M2: "strip repeated headers/footers/page
// numbers detected across pages". Extraction-only; no AI call.
export async function prepareText(
  buffer: Buffer,
  filename: string,
  pages: number[],
): Promise<PreparedPage[]> {
  const pageTexts = await extractPagesText(buffer, filename, pages);
  if (pageTexts.length === 0) return [];

  const candidateCounts = new Map<string, number>();
  for (const page of pageTexts) {
    const band = Math.max(1, Math.min(MAX_BAND_LINES, Math.floor(page.lines.length * BAND_FRACTION)));
    const candidates = new Set(
      [...page.lines.slice(0, band), ...page.lines.slice(-band)].map((l) => normalize(l.text)),
    );
    for (const candidate of candidates) {
      if (!candidate) continue;
      candidateCounts.set(candidate, (candidateCounts.get(candidate) ?? 0) + 1);
    }
  }

  const minCount = Math.max(2, Math.ceil(pageTexts.length * REPETITION_THRESHOLD));
  const repeated = new Set(
    [...candidateCounts.entries()].filter(([, count]) => count >= minCount).map(([text]) => text),
  );

  return pageTexts.map((page) => {
    const keptLines = page.lines.filter((line) => !repeated.has(normalize(line.text)));
    // Compare the first line against the *rest* of the page, not against a
    // median that includes itself — otherwise a short page (heading + one
    // body line) can't tell them apart, since the heading pulls its own
    // baseline up.
    const bodyFontSize = median(keptLines.slice(1).map((l) => l.fontSize));
    return {
      page: page.page,
      text: keptLines.map((l) => l.text).join('\n'),
      startsWithHeading: looksLikeHeading(keptLines[0], bodyFontSize),
    };
  });
}
