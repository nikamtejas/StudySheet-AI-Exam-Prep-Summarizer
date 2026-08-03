import { openPdf } from './pdf';

export interface TextLine {
  text: string;
  fontSize: number;
}

export interface PageText {
  page: number;
  lines: TextLine[];
  rawText: string;
}

interface TextItemLike {
  str?: string;
  height?: number;
  transform?: number[];
}

interface LineGroup {
  y: number;
  fontSize: number;
  parts: { x: number; text: string }[];
}

const Y_TOLERANCE = 2;

// Reconstructs line-level structure from pdfjs's flat text-item stream by
// clustering items with near-identical y-coordinates. Needed for both
// header/footer detection (pipeline/prepare.ts) and heading detection
// (pipeline/chunk.ts) — neither works on a single joined blob of page text.
export async function extractPagesText(
  buffer: Buffer,
  filename: string,
  pages: number[],
): Promise<PageText[]> {
  if (pages.length === 0) return [];

  const pdf = await openPdf(buffer, filename);
  const wanted = new Set(pages);
  const maxPage = Math.max(...pages);
  const results: PageText[] = [];

  for (let pageNum = 1; pageNum <= maxPage; pageNum++) {
    if (!wanted.has(pageNum)) continue;
    const page = await pdf.getPage(pageNum);
    try {
      const textContent = await page.getTextContent();
      const items = textContent.items as TextItemLike[];

      const lineGroups: LineGroup[] = [];
      for (const item of items) {
        const str = item.str ?? '';
        if (!str.trim()) continue;
        const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
        const x = transform[4] ?? 0;
        const y = transform[5] ?? 0;
        const fontSize = item.height ?? Math.abs(transform[3] ?? 10);

        let group = lineGroups.find((g) => Math.abs(g.y - y) <= Y_TOLERANCE);
        if (!group) {
          group = { y, fontSize, parts: [] };
          lineGroups.push(group);
        }
        group.parts.push({ x, text: str });
      }

      // PDF y-axis grows upward — sort top-to-bottom for reading order.
      lineGroups.sort((a, b) => b.y - a.y);
      const lines: TextLine[] = lineGroups
        .map((g) => ({
          text: g.parts
            .sort((a, b) => a.x - b.x)
            .map((p) => p.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim(),
          fontSize: g.fontSize,
        }))
        .filter((l) => l.text.length > 0);

      results.push({ page: pageNum, lines, rawText: lines.map((l) => l.text).join('\n') });
    } finally {
      page.cleanup();
    }
  }

  await pdf.destroy();
  return results;
}
