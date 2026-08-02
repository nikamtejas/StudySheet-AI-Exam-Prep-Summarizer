import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export interface RasterizedPage {
  page: number;
  jpegBuffer: Buffer;
}

export const RASTER_DPI = 150;
export const RASTER_JPEG_QUALITY = 80;

function groupContiguous(pages: number[]): number[][] {
  const sorted = [...pages].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const p of sorted) {
    const last = groups.at(-1);
    const lastValue = last?.at(-1);
    if (last && lastValue !== undefined && p === lastValue + 1) {
      last.push(p);
    } else {
      groups.push([p]);
    }
  }
  return groups;
}

async function rasterizeRange(
  inputPath: string,
  dir: string,
  firstPage: number,
  lastPage: number,
): Promise<RasterizedPage[]> {
  const outputPrefix = path.join(dir, `range-${firstPage}-${lastPage}`);
  await execFileAsync('pdftoppm', [
    '-jpeg',
    '-jpegopt',
    `quality=${RASTER_JPEG_QUALITY}`,
    '-r',
    String(RASTER_DPI),
    '-f',
    String(firstPage),
    '-l',
    String(lastPage),
    inputPath,
    outputPrefix,
  ]);

  const prefixName = path.basename(outputPrefix);
  const pattern = new RegExp(`^${prefixName}-(\\d+)\\.jpg$`);
  const files = await readdir(dir);
  const results: RasterizedPage[] = [];
  for (const file of files) {
    const match = file.match(pattern);
    if (!match) continue;
    const jpegBuffer = await readFile(path.join(dir, file));
    results.push({ page: Number(match[1]), jpegBuffer });
  }
  return results;
}

// Renders the given 1-indexed pages of a PDF to JPEG at 150 DPI / quality 80
// via poppler's pdftoppm. See pipeline/pdf.ts for why this shells out to
// poppler instead of rendering through pdfjs-dist in-process (its Node canvas
// rendering path proved fragile across canvas-library versions during M1).
//
// Pages are grouped into contiguous runs before rendering so a document with
// a handful of scattered vision pages doesn't pay for rendering everything
// in between, and a long contiguous scan doesn't spawn one subprocess per page.
export async function rasterizePages(buffer: Buffer, pages: number[]): Promise<RasterizedPage[]> {
  if (pages.length === 0) return [];

  const dir = await mkdtemp(path.join(tmpdir(), 'studysheet-raster-'));
  const inputPath = path.join(dir, 'input.pdf');

  try {
    await writeFile(inputPath, buffer);
    const groups = groupContiguous(pages);
    const results: RasterizedPage[] = [];
    for (const group of groups) {
      const first = group.at(0);
      const last = group.at(-1);
      if (first === undefined || last === undefined) continue; // groups are never empty
      results.push(...(await rasterizeRange(inputPath, dir, first, last)));
    }
    return results.sort((a, b) => a.page - b.page);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
