import { z } from 'zod';
import { callStructured } from '../ai/client';
import type { Chunk } from './chunk';

export const ChunkDefinitionSchema = z.object({
  term: z.string(),
  definition: z.string(),
  pageRef: z.number().int().positive(),
});
export type ChunkDefinition = z.infer<typeof ChunkDefinitionSchema>;

export const ChunkKeyPointSchema = z.object({
  text: z.string(),
  pageRef: z.number().int().positive(),
});
export type ChunkKeyPoint = z.infer<typeof ChunkKeyPointSchema>;

export const ChunkFormulaSchema = z.object({
  expression: z.string(),
  description: z.string(),
  pageRef: z.number().int().positive(),
});
export type ChunkFormula = z.infer<typeof ChunkFormulaSchema>;

export const ChunkProblemSchema = z.object({
  statement: z.string(),
  pageRef: z.number().int().positive(),
});
export type ChunkProblem = z.infer<typeof ChunkProblemSchema>;

// Per-chunk map output — see docs/studysheet-build-prompt.md §7 stage 5.
// Internal to the backend pipeline; never sent to the frontend, so this
// lives in pipeline/ rather than contracts/.
export const ChunkExtractionSchema = z.object({
  definitions: z.array(ChunkDefinitionSchema),
  keyPoints: z.array(ChunkKeyPointSchema),
  formulas: z.array(ChunkFormulaSchema),
  problems: z.array(ChunkProblemSchema),
  pageRefs: z.array(z.number().int().positive()),
});
export type ChunkExtraction = z.infer<typeof ChunkExtractionSchema>;

export const MAP_SYSTEM_PROMPT = `You are extracting structured study material from a chunk of lecture notes or textbook pages for an exam-prep tool.

Rules:
- Quote definitions from the source where it states them precisely. Only rewrite when the source is unclear — fabricated definitions are the single biggest quality risk.
- Every item must carry the page number it came from (pageRef), taken from the "[page N]" markers in the source text.
- keyPoints are short, exam-relevant facts, conditions, or exceptions — not a paraphrase of the whole page.
- formulas: only include formulas or named processes actually present in the source.
- problems: numbered exercises, worked examples, or anything followed by a derivation — capture the problem statement only, not a solution.
- If a category has nothing in this chunk, return an empty array for it. Do not invent content to fill a category.
- pageRefs is the sorted, de-duplicated list of every page number that appears in this chunk.
- Output strict JSON matching the schema. No prose outside the JSON.`;

// One call per chunk, never batched — batching degrades step quality and
// makes verification harder to reason about (docs/studysheet-milestones.md M2).
export async function mapChunk(chunk: Chunk) {
  const userContent = `Source: pages ${chunk.startPage}-${chunk.endPage} of a document, each page prefixed with a "[page N]" marker.\n\n${chunk.text}`;
  return callStructured({
    model: 'sonnet',
    system: MAP_SYSTEM_PROMPT,
    userContent,
    schema: ChunkExtractionSchema,
    maxTokens: 4096,
  });
}
