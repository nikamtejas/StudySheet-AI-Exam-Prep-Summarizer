// GENERATED FILE — DO NOT EDIT.
// Source of truth: backend/src/contracts/summary.ts
// Regenerate with: npm run sync:contracts (in backend/)

import { z } from 'zod';
import { HighlightKindSchema, DepthSchema } from './common';

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
  connections: z.array(ConnectionSchema),
  version: z.number().int().positive(),
  createdAt: z.string(),
});
export type SummaryDTO = z.infer<typeof SummarySchema>;

export const JobStageSchema = z.enum([
  'queued',
  'preparing',
  'chunking',
  'mapping',
  'reducing',
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
  userId: z.string().min(1).default('anonymous'),
});
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;

export const JobSchema = z.object({
  id: z.string(),
  userId: z.string(),
  documentIds: z.array(z.string()),
  status: JobStatusSchema,
  stage: JobStageSchema,
  tokensUsed: z.object({ input: z.number().int().nonnegative(), output: z.number().int().nonnegative() }),
  costCents: z.number().nonnegative(),
  summaryId: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type JobDTO = z.infer<typeof JobSchema>;
