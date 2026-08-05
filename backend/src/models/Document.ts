import { Schema, model, type HydratedDocument } from 'mongoose';
import type { DetectedPage, SourceType, PagePath } from '../contracts';

export interface DocumentAttrs {
  userId: string;
  filename: string;
  r2Key: string;
  sizeBytes: number;
  pageCount: number;
  fileHash: string;
  requestedSourceType: SourceType;
  detectedPerPage: DetectedPage[];
  textPageCount: number;
  visionPageCount: number;
  overrideNotice: string | null;
  createdAt: Date;
  // See models/Job.ts's anonymousExpiresAt — same TTL-cleanup mechanism,
  // set only for anonymous-trial uploads.
  anonymousExpiresAt: Date | null;
}

export type DocumentInstance = HydratedDocument<DocumentAttrs>;

const DetectedPageSchema = new Schema<DetectedPage>(
  {
    page: { type: Number, required: true },
    hasTextLayer: { type: Boolean, required: true },
    charCount: { type: Number, required: true },
    rotation: { type: Number, required: true },
    lang: { type: String, default: null },
    path: { type: String, enum: ['text', 'vision'] satisfies PagePath[], required: true },
    rasterKey: { type: String, default: null },
    rasterSizeBytes: { type: Number, default: null },
  },
  { _id: false },
);

const DocumentMongooseSchema = new Schema<DocumentAttrs>(
  {
    userId: { type: String, required: true },
    filename: { type: String, required: true },
    r2Key: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    pageCount: { type: Number, required: true },
    fileHash: { type: String, required: true },
    requestedSourceType: {
      type: String,
      enum: ['typed', 'handwritten', 'slides', 'mixed'] satisfies SourceType[],
      required: true,
    },
    detectedPerPage: { type: [DetectedPageSchema], default: [] },
    textPageCount: { type: Number, required: true },
    visionPageCount: { type: Number, required: true },
    overrideNotice: { type: String, default: null },
    anonymousExpiresAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The same file, for the same user, must never be ingested twice — this unique
// index is the real source of truth for dedup; the findOne() in ingest.ts is
// just a fast path that skips the expensive probe/rasterize work in the
// common case (see docs/studysheet-build-prompt.md §8).
DocumentMongooseSchema.index({ userId: 1, fileHash: 1 }, { unique: true });
DocumentMongooseSchema.index({ anonymousExpiresAt: 1 }, { expireAfterSeconds: 0 });

export const DocumentModel = model<DocumentAttrs>('Document', DocumentMongooseSchema);
