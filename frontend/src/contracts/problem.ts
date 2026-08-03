// GENERATED FILE — DO NOT EDIT.
// Source of truth: backend/src/contracts/problem.ts
// Regenerate with: npm run sync:contracts (in backend/)

import { z } from 'zod';
import { SubjectSchema } from './common';

export const StepSchema = z.object({
  n: z.number().int().positive(),
  action: z.string(),
  math: z.string(),
  why: z.string(),
  watchOut: z.string().optional(),
});
export type Step = z.infer<typeof StepSchema>;

// Ten primitives, no more (docs/studysheet-build-prompt.md §4). Nested shapes
// (geometry/flowchart/tree/grid internals) are deliberately loose here — M5
// "Visual primitives" owns the renderer and tightens each kind's fields to
// match what its React SVG component actually needs. M4's job is only to
// constrain the model to one of these ten shapes via structured output.
export const VisualSpecSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('functionPlot'),
    fns: z.array(z.string()),
    domain: z.tuple([z.number(), z.number()]),
    marks: z.array(z.object({ x: z.number(), y: z.number() })).default([]),
    annotations: z.array(z.string()).default([]),
  }),
  z.object({
    kind: z.literal('numberLine'),
    range: z.tuple([z.number(), z.number()]),
    points: z.array(z.number()).default([]),
    intervals: z.array(z.tuple([z.number(), z.number()])).default([]),
  }),
  z.object({
    kind: z.literal('geometry'),
    shapes: z.array(z.unknown()).default([]),
    labels: z.array(z.unknown()).default([]),
    angles: z.array(z.unknown()).default([]),
    congruenceMarks: z.array(z.unknown()).default([]),
  }),
  z.object({
    kind: z.literal('vectorDiagram'),
    vectors: z.array(
      z.object({
        from: z.tuple([z.number(), z.number()]),
        to: z.tuple([z.number(), z.number()]),
        label: z.string().optional(),
      }),
    ),
    axes: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal('flowchart'),
    nodes: z.array(z.unknown()).default([]),
    edges: z.array(z.unknown()).default([]),
  }),
  z.object({
    kind: z.literal('tree'),
    root: z.unknown(),
  }),
  z.object({
    kind: z.literal('grid'),
    rows: z.array(z.array(z.unknown())).default([]),
    highlight: z.array(z.unknown()).default([]),
  }),
  z.object({
    kind: z.literal('timeline'),
    events: z.array(z.object({ at: z.string(), label: z.string() })).default([]),
  }),
  z.object({
    kind: z.literal('cycle'),
    stages: z.array(z.unknown()).default([]),
  }),
  z.object({
    kind: z.literal('compare'),
    left: z.unknown(),
    right: z.unknown(),
    axes: z.array(z.string()).default([]),
  }),
]);
export type VisualSpec = z.infer<typeof VisualSpecSchema>;

// One model call's worth of output — docs/studysheet-build-prompt.md §4
// "Solution format". `why` on every step is non-negotiable (enforced by the
// schema being required, not optional): "A step list without reasons is a
// photocopy of the textbook."
export const SolvedProblemSchema = z.object({
  problem: z.string(),
  subject: SubjectSchema,
  given: z.array(z.string()),
  goal: z.string(),
  strategy: z.string(),
  steps: z.array(StepSchema),
  answer: z.object({
    value: z.string(),
    units: z.string().optional(),
  }),
  check: z.string(),
  commonMistake: z.string(),
  visual: VisualSpecSchema.optional(),
  memoryHook: z.string(),
});
export type SolvedProblem = z.infer<typeof SolvedProblemSchema>;

// What's actually persisted per problem: the solved JSON plus the outcome of
// independent verification (docs/studysheet-build-prompt.md §4
// "Correctness") and the source page it came from. `verified: false` must
// still carry the full `SolvedProblem` payload — disagreement downgrades
// visibility, it never deletes the answer (reliability invariant 5).
export const VerifiedProblemSchema = SolvedProblemSchema.extend({
  pageRef: z.number().int().positive(),
  verified: z.boolean(),
  verificationNote: z.string().optional(),
});
export type VerifiedProblem = z.infer<typeof VerifiedProblemSchema>;
