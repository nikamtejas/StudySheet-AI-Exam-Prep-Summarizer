import { Schema, model, type HydratedDocument } from 'mongoose';
import type { JobStage, JobStatus, Depth, VerifiedProblem } from '../contracts';
import type { ChunkExtraction, ChunkProblem } from '../pipeline/map';
import type { PreparedPage } from '../pipeline/prepare';
import type { Chunk } from '../pipeline/chunk';
import type { VisionChunk } from '../pipeline/chunkVision';
import type { ReducedContent } from '../pipeline/reduce';

// A vision-eligible page not yet batched — the raw input to
// pipeline/chunkVision.ts's chunkVisionPages(). Populated during the
// "queued" stage for a Document-backed job, or directly by the CLI for a
// local-file run (which still needs real storage keys — see cli/summarize.ts).
export interface VisionPageRecord {
  page: number;
  rasterKey: string;
  sizeBytes: number;
}

export interface ChunkResultRecord {
  chunkIndex: number;
  result: ChunkExtraction;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

// One detected-but-not-yet-solved problem carried forward from reduce's
// output into the "solving" stage — see pipeline/orchestrate.ts.
export interface ProblemResultRecord {
  problemIndex: number;
  result: VerifiedProblem;
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
  // Vision-path (M3): raw eligible pages, batched into visionChunks during
  // the "chunking" stage. visionChunks' indices continue directly after
  // `chunks`, so the same chunkResults array and skip-if-already-done logic
  // in pipeline/orchestrate.ts work unchanged for both kinds.
  visionPages: VisionPageRecord[];
  visionChunks: VisionChunk[];
  chunkResults: ChunkResultRecord[];
  reduced: ReducedContent | null;
  // Solve path (M4): problems detected during reduce, solved+verified one at
  // a time (concurrency-capped, not sequential) during the "solving" stage.
  // See docs/studysheet-milestones.md M4 and reliability invariants 2/6.
  problems: ChunkProblem[];
  problemResults: ProblemResultRecord[];
  tokensUsed: { input: number; output: number };
  costCents: number;
  summaryId: string | null;
  error: string | null;
  // Reserved page count for this job's quota hold (pipeline/quota.ts) —
  // stored here so the worker can release exactly what was reserved on
  // failure without recomputing it from documentIds (a Document could in
  // principle change between reservation and release).
  reservedPages: number;
  // Set once commitQuota/releaseQuota has run for this job — BullMQ never
  // auto-retries (attempts: 1, worker/queue.ts), but a failed job can still
  // be manually re-added to the queue by an operator, and processJob() would
  // then reach the same failure/success branch again. Reliability invariant
  // 7 ("quota moves through one code path with reservation-then-commit
  // semantics") means that second pass must not double-release or
  // double-commit the same reservation.
  quotaSettled: boolean;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  // Set only for anonymous-trial jobs (api/middleware/identity.ts) — a TTL
  // index (below) makes Mongo delete these automatically 24h after creation.
  // Never set for a signed-in user's job, which is how the same index leaves
  // real accounts' jobs alone.
  anonymousExpiresAt: Date | null;
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

const VisionPageMongooseSchema = new Schema<VisionPageRecord>(
  {
    page: { type: Number, required: true },
    rasterKey: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
  },
  { _id: false },
);

const VisionChunkMongooseSchema = new Schema<VisionChunk>(
  {
    index: { type: Number, required: true },
    pages: { type: [Number], required: true },
    rasterKeys: { type: [String], required: true },
  },
  { _id: false },
);

const ChunkProblemMongooseSchema = new Schema<ChunkProblem>(
  {
    statement: { type: String, required: true },
    pageRef: { type: Number, required: true },
  },
  { _id: false },
);

const ProblemResultMongooseSchema = new Schema<ProblemResultRecord>(
  {
    problemIndex: { type: Number, required: true },
    result: { type: Schema.Types.Mixed, required: true },
    inputTokens: { type: Number, required: true },
    outputTokens: { type: Number, required: true },
    costCents: { type: Number, required: true },
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
      enum: [
        'queued',
        'preparing',
        'chunking',
        'mapping',
        'reducing',
        'solving',
        'synthesizing',
        'done',
        'failed',
      ],
      default: 'queued',
    },
    config: {
      depth: { type: String, enum: ['crash', 'balanced', 'deep'], default: 'balanced' },
      language: { type: String },
    },
    preparedPages: { type: [PreparedPageMongooseSchema], default: [] },
    chunks: { type: [ChunkMongooseSchema], default: [] },
    visionPages: { type: [VisionPageMongooseSchema], default: [] },
    visionChunks: { type: [VisionChunkMongooseSchema], default: [] },
    chunkResults: { type: [ChunkResultMongooseSchema], default: [] },
    reduced: { type: Schema.Types.Mixed, default: null },
    problems: { type: [ChunkProblemMongooseSchema], default: [] },
    problemResults: { type: [ProblemResultMongooseSchema], default: [] },
    tokensUsed: {
      input: { type: Number, default: 0 },
      output: { type: Number, default: 0 },
    },
    costCents: { type: Number, default: 0 },
    summaryId: { type: String, default: null },
    error: { type: String, default: null },
    reservedPages: { type: Number, default: 0 },
    quotaSettled: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    anonymousExpiresAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

JobMongooseSchema.index({ userId: 1, createdAt: -1 });
JobMongooseSchema.index({ anonymousExpiresAt: 1 }, { expireAfterSeconds: 0 });

export const JobModel = model<JobAttrs>('Job', JobMongooseSchema);
