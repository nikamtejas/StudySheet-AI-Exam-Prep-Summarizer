import { openPdf } from './pdf';
import { detectLanguage } from './lang';
import { validatePageCount } from './validate';
import type { DetectedPage } from '../contracts';

// Below this many characters, treat a page as not having a usable text layer —
// a lone slide title ("Slide 4") shouldn't count as a real text layer just
// because it's non-zero. See docs/studysheet-build-prompt.md §2: slides are
// "dense visuals, sparse text" and belong on the vision path regardless.
const MIN_CHARS_FOR_TEXT_PATH = 40;

export interface ProbeResult {
  pageCount: number;
  detectedPerPage: DetectedPage[];
  textPageCount: number;
  visionPageCount: number;
}

interface TextItemLike {
  str?: string;
}

// Per-page analysis only — never renders a page (see pipeline/pdf.ts for why).
// Streams page-by-page and releases each page's cache before moving on, so a
// 200-page document never holds more than one page's data in memory at a time.
export async function probeDocument(buffer: Buffer, filename: string): Promise<ProbeResult> {
  const pdf = await openPdf(buffer, filename);
  const pageCount = pdf.numPages;
  validatePageCount(pageCount, filename);

  const detectedPerPage: DetectedPage[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    try {
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const items = textContent.items as TextItemLike[];
      const text = items.map((item) => item.str ?? '').join(' ');
      const charCount = text.replace(/\s+/g, '').length;
      const hasTextLayer = charCount >= MIN_CHARS_FOR_TEXT_PATH;

      detectedPerPage.push({
        page: pageNum,
        hasTextLayer,
        charCount,
        rotation: viewport.rotation,
        lang: hasTextLayer ? await detectLanguage(text) : null,
        path: hasTextLayer ? 'text' : 'vision',
        rasterKey: null,
      });
    } finally {
      page.cleanup();
    }
  }

  await pdf.destroy();

  const textPageCount = detectedPerPage.filter((p) => p.path === 'text').length;
  const visionPageCount = pageCount - textPageCount;

  return { pageCount, detectedPerPage, textPageCount, visionPageCount };
}
