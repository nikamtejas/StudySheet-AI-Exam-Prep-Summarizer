import { PDFDocument } from 'pdf-lib';
import { createRenderToken } from '../lib/renderToken';
import { getWarmBrowser } from '../lib/puppeteerPool';
import { uploadObject, createPresignedDownloadUrl } from '../lib/storage';
import { logger } from '../lib/logger';
import { env } from '../config/env';

export type RenderVariant = 'full' | 'onepager' | 'appendix';
export type RenderSize = 'a4' | 'letter';

export interface RenderResult {
  r2Key: string;
  url: string;
  sizeBytes: number;
}

const RENDER_READY_TIMEOUT_MS = 5000;
// One-pager fit-to-page retries: each attempt drops one more (lowest-
// priority) content block — see frontend's OnePager.tsx. Bounded so a
// pathologically large summary degrades to "smallest content set" rather
// than looping forever.
const MAX_ONEPAGER_TRIM_ATTEMPTS = 20;

// Chromium's PDF output is NOT byte-identical across separate page.pdf()
// calls for identical content — confirmed directly (two renders of the same
// static HTML differed despite no visible timestamp). Re-serializing through
// pdf-lib with normalized dates/producer and no object streams (a
// deterministic layout) makes them byte-identical — confirmed directly
// too. This is what actually delivers "same JSON in → byte-comparable PDF
// out" (docs/studysheet-milestones.md M6); Puppeteer's raw output does not.
async function canonicalize(pdf: Uint8Array): Promise<{ buffer: Buffer; pageCount: number }> {
  const doc = await PDFDocument.load(pdf);
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
  doc.setProducer('');
  doc.setCreator('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setTitle('');
  const saved = await doc.save({ useObjectStreams: false });
  return { buffer: Buffer.from(saved), pageCount: doc.getPageCount() };
}

async function renderOnce(
  summaryId: string,
  variant: RenderVariant,
  size: RenderSize,
  trimLevel: number,
): Promise<{ buffer: Buffer; pageCount: number }> {
  const { token } = await createRenderToken(summaryId);
  const browser = await getWarmBrowser();
  const page = await browser.newPage();
  try {
    const url = new URL(`/print/${summaryId}`, env.FRONTEND_URL);
    url.searchParams.set('token', token);
    url.searchParams.set('variant', variant);
    url.searchParams.set('size', size);
    if (variant === 'onepager') url.searchParams.set('trimLevel', String(trimLevel));

    const response = await page.goto(url.toString(), { waitUntil: 'load' });
    if (!response || !response.ok()) {
      throw new Error(`print route returned ${response?.status() ?? 'no response'} for ${url}`);
    }

    // Never a fixed setTimeout (docs/studysheet-milestones.md M6) — the
    // print page flips this attribute itself once fonts have settled.
    await page.waitForSelector('[data-render-ready="true"]', { timeout: RENDER_READY_TIMEOUT_MS });

    const pdf = await page.pdf({ format: size, printBackground: true });
    return canonicalize(pdf);
  } finally {
    await page.close();
  }
}

// Renders a Summary to PDF with zero AI calls (docs/studysheet-milestones.md
// M6 gate — this function never imports anything from ai/ or pipeline/solve
// or synthesize) and uploads it to R2. The one-pager variant measures the
// actual rendered page count and re-renders with progressively more content
// dropped until it fits one page — never by shrinking type below the print
// CSS's floor, only by removing the lowest-priority blocks (frontend's
// OnePager.tsx owns that priority order; this loop just drives the retry).
export async function renderSummary(
  summaryId: string,
  variant: RenderVariant,
  size: RenderSize = 'a4',
): Promise<RenderResult> {
  const log = logger.child({ summaryId, variant, size });
  let result: { buffer: Buffer; pageCount: number };

  if (variant === 'onepager') {
    let trimLevel = 0;
    result = await renderOnce(summaryId, variant, size, trimLevel);
    while (result.pageCount > 1 && trimLevel < MAX_ONEPAGER_TRIM_ATTEMPTS) {
      trimLevel += 1;
      log.info({ trimLevel, pageCount: result.pageCount }, 'one-pager overflowed, trimming and retrying');
      result = await renderOnce(summaryId, variant, size, trimLevel);
    }
  } else {
    result = await renderOnce(summaryId, variant, size, 0);
  }

  const r2Key = `renders/${summaryId}/${variant}-${size}.pdf`;
  await uploadObject(r2Key, result.buffer, 'application/pdf');
  const url = await createPresignedDownloadUrl(r2Key);

  log.info({ r2Key, pageCount: result.pageCount, sizeBytes: result.buffer.length }, 'render complete');

  return { r2Key, url, sizeBytes: result.buffer.length };
}
