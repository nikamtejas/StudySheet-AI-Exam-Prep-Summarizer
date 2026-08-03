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

// Ten primitives, no more (docs/studysheet-build-prompt.md §4). Shared
// building blocks for the nested shapes below — SVG coordinates, so a bare
// [x, y] tuple in "diagram space" (each renderer picks its own viewBox/scale;
// these are unitless design-space coordinates, not screen pixels).
const PointSchema = z.tuple([z.number(), z.number()]);
export type PointTuple = z.infer<typeof PointSchema>;

const GeometryShapeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('polygon'), points: z.array(PointSchema).min(3) }),
  z.object({ type: z.literal('circle'), center: PointSchema, radius: z.number().positive() }),
  z.object({ type: z.literal('segment'), from: PointSchema, to: PointSchema }),
]);
export type GeometryShape = z.infer<typeof GeometryShapeSchema>;

const GeometryLabelSchema = z.object({ text: z.string(), at: PointSchema });
const GeometryAngleSchema = z.object({
  at: PointSchema,
  from: PointSchema,
  to: PointSchema,
  label: z.string().optional(),
});
const GeometryCongruenceMarkSchema = z.object({
  from: PointSchema,
  to: PointSchema,
  // Tick-mark count on the segment — the standard "these sides are equal"
  // notation (1 tick = one equivalence class, 2 = another, etc.).
  ticks: z.number().int().min(1).max(3).default(1),
});

const FlowchartNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  shape: z.enum(['rect', 'diamond', 'oval']).default('rect'),
});
const FlowchartEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
});

export interface TreeNode {
  label: string;
  children: TreeNode[];
}
// The input type (pre-`.default()`) has optional `children`, distinct from
// the output type above — same input/output split that callStructured's
// generic works around elsewhere in this codebase.
interface TreeNodeInput {
  label: string;
  children?: TreeNodeInput[];
}
// Recursive — z.lazy() is required for self-reference. Confirmed this
// produces a valid JSON Schema (a $ref back to itself) via zod-to-json-schema
// and parses correctly with zod before relying on it for structured output.
const TreeNodeSchema: z.ZodType<TreeNode, z.ZodTypeDef, TreeNodeInput> = z.lazy(() =>
  z.object({
    label: z.string(),
    children: z.array(TreeNodeSchema).default([]),
  }),
);

const CompareSideSchema = z.object({
  title: z.string(),
  points: z.array(z.string()),
});

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
    shapes: z.array(GeometryShapeSchema).default([]),
    labels: z.array(GeometryLabelSchema).default([]),
    angles: z.array(GeometryAngleSchema).default([]),
    congruenceMarks: z.array(GeometryCongruenceMarkSchema).default([]),
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
    nodes: z.array(FlowchartNodeSchema).default([]),
    edges: z.array(FlowchartEdgeSchema).default([]),
  }),
  z.object({
    kind: z.literal('tree'),
    root: TreeNodeSchema,
  }),
  z.object({
    kind: z.literal('grid'),
    rows: z.array(z.array(z.string())).default([]),
    highlight: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])).default([]),
  }),
  z.object({
    kind: z.literal('timeline'),
    events: z.array(z.object({ at: z.string(), label: z.string() })).default([]),
  }),
  z.object({
    kind: z.literal('cycle'),
    stages: z.array(z.string()).default([]),
  }),
  z.object({
    kind: z.literal('compare'),
    left: CompareSideSchema,
    right: CompareSideSchema,
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
