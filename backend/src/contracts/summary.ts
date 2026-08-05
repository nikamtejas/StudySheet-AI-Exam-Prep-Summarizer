import { z } from 'zod';
import { HighlightKindSchema, DepthSchema } from './common';
import { VerifiedProblemSchema } from './problem';

export const HighlightSchema = z.object({
  text: z.string(),
  kind: HighlightKindSchema,
  pageRef: z.number().int().positive(),
});
export type Highlight = z.infer<typeof HighlightSchema>;

// M2 produces the sections that don't depend on solve (M4) or memory hooks
// (M9) infrastructure — see docs/studysheet-milestones.md M2 "Do not" list.
export const SectionTypeSchema = z.enum([
  'in-one-minute',
  'core-concepts',
  'formulas',
  'exam-questions',
  'common-confusions',
  'connections',
  'page-map',
]);
export type SectionType = z.infer<typeof SectionTypeSchema>;

export const SectionSchema = z.object({
  type: SectionTypeSchema,
  title: z.string(),
  body: z.string(),
  highlights: z.array(HighlightSchema).default([]),
});
export type Section = z.infer<typeof SectionSchema>;

export const DefinitionSchema = z.object({
  term: z.string(),
  definition: z.string(),
  pageRef: z.number().int().positive(),
  confidence: z.enum(['high', 'low']).default('high'),
});
export type Definition = z.infer<typeof DefinitionSchema>;

export const ExamQuestionSchema = z.object({
  q: z.string(),
  hint: z.string().optional(),
  pageRef: z.number().int().positive(),
});
export type ExamQuestion = z.infer<typeof ExamQuestionSchema>;

export const ConnectionSchema = z.object({
  from: z.string(),
  to: z.string(),
  note: z.string(),
});
export type Connection = z.infer<typeof ConnectionSchema>;

export const SummarySchema = z.object({
  id: z.string(),
  jobId: z.string(),
  userId: z.string(),
  sections: z.array(SectionSchema),
  definitions: z.array(DefinitionSchema),
  examQuestions: z.array(ExamQuestionSchema),
  problems: z.array(VerifiedProblemSchema),
  connections: z.array(ConnectionSchema),
  version: z.number().int().positive(),
  createdAt: z.string(),
  deckId: z.string().nullable(),
});
export type SummaryDTO = z.infer<typeof SummarySchema>;

export const JobStageSchema = z.enum([
  'queued',
  'preparing',
  'chunking',
  'mapping',
  'reducing',
  'solving',
  'synthesizing',
  'done',
  'failed',
]);
export type JobStage = z.infer<typeof JobStageSchema>;

export const JobStatusSchema = z.enum(['queued', 'active', 'completed', 'failed']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const CreateJobRequestSchema = z.object({
  documentIds: z.array(z.string()).min(1),
  depth: DepthSchema.default('balanced'),
  language: z.string().optional(),
  // Set only in response to a 402 cost_confirmation_required (see
  // pipeline/quota.ts's cost guard) — the client re-submits the identical
  // request with this flag once the user has seen and accepted the estimate.
  confirmed: z.boolean().default(false),
});
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;

// docs/studysheet-build-prompt.md §8 lists `progress: { done, total }` on the
// Job model — computed on read from the persisted chunk/problem arrays
// (chunkResults.length vs chunks.length + visionChunks.length +
// problems.length) rather than stored redundantly, so there's exactly one
// source of truth for "how far along is this job" (api/routes/jobs.ts).
export const JobProgressSchema = z.object({
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type JobProgress = z.infer<typeof JobProgressSchema>;

export const JobSchema = z.object({
  id: z.string(),
  userId: z.string(),
  documentIds: z.array(z.string()),
  status: JobStatusSchema,
  stage: JobStageSchema,
  progress: JobProgressSchema,
  tokensUsed: z.object({ input: z.number().int().nonnegative(), output: z.number().int().nonnegative() }),
  costCents: z.number().nonnegative(),
  summaryId: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type JobDTO = z.infer<typeof JobSchema>;
