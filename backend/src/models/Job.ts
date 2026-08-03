import { Schema, model, type HydratedDocument } from 'mongoose';
import type { JobStage, JobStatus, Depth } from '../contracts';
import type { ChunkExtraction } from '../pipeline/map';
import type { PreparedPage } from '../pipeline/prepare';
import type { Chunk } from '../pipeline/chunk';
import type { ReducedContent } from '../pipeline/reduce';

export interface ChunkResultRecord {
  chunkIndex: number;
  result: ChunkExtraction;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export interface JobAttrs {
  userId: string;
  documentIds: string[];
  status: JobStatus;
  stage: JobStage;
  config: {
    depth: Depth;
    language?: string;
  };
  // Persisted intermediate state at every stage — resuming after a crash
  // means re-entering here and skipping whatever's already recorded, never
  // re-billing a completed chunk. See docs/studysheet-milestones.md M2 and
  // reliability invariants 1/2/6.
  preparedPages: PreparedPage[];
  chunks: Chunk[];
  chunkResults: ChunkResultRecord[];
  reduced: ReducedContent | null;
  tokensUsed: { input: number; output: number };
  costCents: number;
  summaryId: string | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export type JobInstance = HydratedDocument<JobAttrs>;

const ChunkResultMongooseSchema = new Schema<ChunkResultRecord>(
  {
    chunkIndex: { type: Number, required: true },
    result: { type: Schema.Types.Mixed, required: true },
    inputTokens: { type: Number, required: true },
    outputTokens: { type: Number, required: true },
    costCents: { type: Number, required: true },
  },
  { _id: false },
);

const ChunkMongooseSchema = new Schema<Chunk>(
  {
    index: { type: Number, required: true },
    startPage: { type: Number, required: true },
    endPage: { type: Number, required: true },
    text: { type: String, required: true },
    overlapsPreviousBy: { type: Number, required: true },
  },
  { _id: false },
);

const PreparedPageMongooseSchema = new Schema<PreparedPage>(
  {
    page: { type: Number, required: true },
    text: { type: String, required: true },
    startsWithHeading: { type: Boolean, required: true },
  },
  { _id: false },
);

const JobMongooseSchema = new Schema<JobAttrs>(
  {
    userId: { type: String, required: true },
    documentIds: { type: [String], required: true },
    status: {
      type: String,
      enum: ['queued', 'active', 'completed', 'failed'],
      default: 'queued',
    },
    stage: {
      type: String,
      enum: ['queued', 'preparing', 'chunking', 'mapping', 'reducing', 'synthesizing', 'done', 'failed'],
      default: 'queued',
    },
    config: {
      depth: { type: String, enum: ['crash', 'balanced', 'deep'], default: 'balanced' },
      language: { type: String },
    },
    preparedPages: { type: [PreparedPageMongooseSchema], default: [] },
    chunks: { type: [ChunkMongooseSchema], default: [] },
    chunkResults: { type: [ChunkResultMongooseSchema], default: [] },
    reduced: { type: Schema.Types.Mixed, default: null },
    tokensUsed: {
      input: { type: Number, default: 0 },
      output: { type: Number, default: 0 },
    },
    costCents: { type: Number, default: 0 },
    summaryId: { type: String, default: null },
    error: { type: String, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

JobMongooseSchema.index({ userId: 1, createdAt: -1 });

export const JobModel = model<JobAttrs>('Job', JobMongooseSchema);
