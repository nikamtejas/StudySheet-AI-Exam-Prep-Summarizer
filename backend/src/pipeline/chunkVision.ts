export interface VisionPageInput {
  page: number;
  sizeBytes: number;
}

export interface VisionPageBatch {
  pages: number[];
}

// A batch with an assigned index (continuing the text-chunk index space —
// see pipeline/orchestrate.ts) and the storage key for each page's raster,
// in the same order as `pages`. This is what actually gets persisted on the
// Job document.
export interface VisionChunk {
  index: number;
  pages: number[];
  rasterKeys: string[];
}

// Per docs/studysheet-build-prompt.md §6: "100 pages max and ~32MB max per
// API request for PDF input... base64 inflates size ~33%". We reference
// rasterized pages by Files API file_id rather than inline base64 (see
// ai/client.ts), so the wire request itself stays tiny regardless of image
// count — but the 20-page batch size is still a deliberate, fixed choice
// (docs/studysheet-milestones.md M3), and the byte ceiling is kept as a
// conservative safety margin against unusually large source images.
const MAX_PAGES_PER_BATCH = 20;
const MAX_RAW_BYTES_PER_BATCH = 24 * 1024 * 1024;

// Splits vision-path pages into batches of ≤20 pages (or fewer if raw image
// bytes would approach the request-size ceiling first). No overlap between
// batches — unlike text chunking, there's no shared "concept" to protect
// across an image boundary. A document with more vision pages than fit in
// one batch is "split automatically" simply by producing more than one
// batch here; the orchestrator maps one vision-map call per batch.
export function chunkVisionPages(pages: VisionPageInput[]): VisionPageBatch[] {
  const sorted = [...pages].sort((a, b) => a.page - b.page);
  const batches: VisionPageBatch[] = [];
  let current: number[] = [];
  let currentBytes = 0;

  for (const page of sorted) {
    const wouldExceedCount = current.length >= MAX_PAGES_PER_BATCH;
    const wouldExceedBytes = current.length > 0 && currentBytes + page.sizeBytes > MAX_RAW_BYTES_PER_BATCH;
    if (wouldExceedCount || wouldExceedBytes) {
      batches.push({ pages: current });
      current = [];
      currentBytes = 0;
    }
    current.push(page.page);
    currentBytes += page.sizeBytes;
  }
  if (current.length > 0) batches.push({ pages: current });

  return batches;
}
