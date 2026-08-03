import { createHash } from 'node:crypto';
import { validateFileBasics } from './validate';
import { probeDocument } from './probe';
import { rasterizePages } from './rasterize';
import { downloadObject, uploadObject } from '../lib/storage';
import { DocumentModel, type DocumentInstance } from '../models/Document';
import type { DocumentDTO, SourceType } from '../contracts';

export interface IngestParams {
  userId: string;
  filename: string;
  // Where the client already PUT the raw PDF via a presigned URL — ingest
  // downloads it from there rather than accepting bytes directly, matching
  // the presign → upload → register flow in docs/studysheet-build-prompt.md §10.
  r2Key: string;
  sourceType: SourceType;
}

export interface IngestResult {
  document: DocumentDTO;
  dedup: boolean;
}

const MONGO_DUPLICATE_KEY_CODE = 11000;

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === MONGO_DUPLICATE_KEY_CODE;
}

function computeOverrideNotice(
  requested: SourceType,
  visionPageCount: number,
  pageCount: number,
): string | null {
  // Spec's example is specifically the "claimed typed, turned out unreadable"
  // direction (docs/studysheet-build-prompt.md §2) — that's the surprising,
  // notice-worthy case. 'handwritten'/'slides'/'mixed' already expect vision
  // pages, so there's nothing to override.
  if (requested !== 'typed' || visionPageCount === 0) return null;
  const pages = pageCount === 1 ? 'page' : 'pages';
  return `${visionPageCount} of ${pageCount} ${pages} had no readable text layer — read as handwriting/images instead.`;
}

function toDTO(doc: DocumentInstance): DocumentDTO {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    filename: doc.filename,
    r2Key: doc.r2Key,
    sizeBytes: doc.sizeBytes,
    pageCount: doc.pageCount,
    fileHash: doc.fileHash,
    requestedSourceType: doc.requestedSourceType,
    detectedPerPage: doc.detectedPerPage,
    textPageCount: doc.textPageCount,
    visionPageCount: doc.visionPageCount,
    overrideNotice: doc.overrideNotice,
    createdAt: doc.createdAt.toISOString(),
  };
}

// Orchestrates M1's ingest → probe → rasterize → persist flow. Does not call
// any model (that starts at M2) and never does the expensive work twice for
// the same user+file (docs/studysheet-milestones.md M1 done-criteria).
export async function ingestDocument(params: IngestParams): Promise<IngestResult> {
  const { userId, filename, r2Key, sourceType } = params;

  const buffer = await downloadObject(r2Key);
  validateFileBasics(buffer, filename);
  const fileHash = createHash('sha256').update(buffer).digest('hex');

  const existing = await DocumentModel.findOne({ userId, fileHash });
  if (existing) {
    return { document: toDTO(existing), dedup: true };
  }

  const probeResult = await probeDocument(buffer, filename);

  const visionPages = probeResult.detectedPerPage
    .filter((p) => p.path === 'vision')
    .map((p) => p.page);

  if (visionPages.length > 0) {
    const rasterized = await rasterizePages(buffer, visionPages);
    const byPage = new Map(probeResult.detectedPerPage.map((p) => [p.page, p]));
    for (const { page, jpegBuffer } of rasterized) {
      const rasterKey = `documents/${fileHash}/pages/${page}.jpg`;
      await uploadObject(rasterKey, jpegBuffer, 'image/jpeg');
      const entry = byPage.get(page);
      if (entry) {
        entry.rasterKey = rasterKey;
        entry.rasterSizeBytes = jpegBuffer.byteLength;
      }
    }
  }

  const overrideNotice = computeOverrideNotice(
    sourceType,
    probeResult.visionPageCount,
    probeResult.pageCount,
  );

  try {
    const created = await DocumentModel.create({
      userId,
      filename,
      r2Key,
      sizeBytes: buffer.byteLength,
      pageCount: probeResult.pageCount,
      fileHash,
      requestedSourceType: sourceType,
      detectedPerPage: probeResult.detectedPerPage,
      textPageCount: probeResult.textPageCount,
      visionPageCount: probeResult.visionPageCount,
      overrideNotice,
    });
    return { document: toDTO(created), dedup: false };
  } catch (err) {
    // Two concurrent requests for the same file can both pass the findOne()
    // check above before either finishes — the unique index is what actually
    // prevents the duplicate; this just turns that race into a normal dedup
    // response instead of a 500.
    if (isDuplicateKeyError(err)) {
      const raceWinner = await DocumentModel.findOne({ userId, fileHash });
      if (raceWinner) return { document: toDTO(raceWinner), dedup: true };
    }
    throw err;
  }
}
