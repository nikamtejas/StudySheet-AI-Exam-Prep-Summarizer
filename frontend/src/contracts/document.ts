// GENERATED FILE — DO NOT EDIT.
// Source of truth: backend/src/contracts/document.ts
// Regenerate with: npm run sync:contracts (in backend/)

import { z } from 'zod';
import { SourceTypeSchema } from './common';

export const PagePathSchema = z.enum(['text', 'vision']);
export type PagePath = z.infer<typeof PagePathSchema>;

export const DetectedPageSchema = z.object({
  page: z.number().int().positive(),
  hasTextLayer: z.boolean(),
  charCount: z.number().int().nonnegative(),
  rotation: z.number().int(),
  lang: z.string().nullable(),
  path: PagePathSchema,
  // Storage key for the rasterized JPEG. Only set once the vision path has
  // actually rasterized this page (M1 rasterizes eagerly; see pipeline/rasterize.ts).
  rasterKey: z.string().nullable(),
  // Byte size of that JPEG — lets pipeline/chunkVision.ts (M3) batch pages
  // without downloading every raster just to measure it.
  rasterSizeBytes: z.number().int().nonnegative().nullable(),
});
export type DetectedPage = z.infer<typeof DetectedPageSchema>;

export const DocumentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  filename: z.string(),
  r2Key: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  pageCount: z.number().int().positive(),
  fileHash: z.string(),
  requestedSourceType: SourceTypeSchema,
  detectedPerPage: z.array(DetectedPageSchema),
  textPageCount: z.number().int().nonnegative(),
  visionPageCount: z.number().int().nonnegative(),
  // Set when auto-detect disagrees with the user's requested source type —
  // see docs/studysheet-build-prompt.md §2 ("override a wrong user choice
  // with a visible notice"). Null when they agree or sourceType was 'mixed'.
  overrideNotice: z.string().nullable(),
  createdAt: z.string(),
});
export type DocumentDTO = z.infer<typeof DocumentSchema>;

export const PresignRequestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.literal('application/pdf'),
});
export type PresignRequest = z.infer<typeof PresignRequestSchema>;

export const PresignResponseSchema = z.object({
  uploadUrl: z.string(),
  r2Key: z.string(),
});
export type PresignResponse = z.infer<typeof PresignResponseSchema>;

export const CreateDocumentRequestSchema = z.object({
  r2Key: z.string().min(1),
  filename: z.string().min(1),
  sourceType: SourceTypeSchema.default('mixed'),
  // TEMP: no auth yet (arrives in M8). Callers pass an arbitrary id for now;
  // once sessions exist this comes from req.user.id instead.
  userId: z.string().min(1).default('anonymous'),
});
export type CreateDocumentRequest = z.infer<typeof CreateDocumentRequestSchema>;

export const CreateDocumentResponseSchema = z.object({
  document: DocumentSchema,
  dedup: z.boolean(),
});
export type CreateDocumentResponse = z.infer<typeof CreateDocumentResponseSchema>;
