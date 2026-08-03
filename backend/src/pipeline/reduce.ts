import type { ChunkExtraction, ChunkDefinition, ChunkKeyPoint, ChunkFormula, ChunkProblem } from './map';

export interface RankedDefinition extends ChunkDefinition {
  mentionCount: number;
}
export interface RankedKeyPoint extends ChunkKeyPoint {
  mentionCount: number;
}

export interface ReducedContent {
  definitions: RankedDefinition[];
  keyPoints: RankedKeyPoint[];
  formulas: ChunkFormula[];
  problems: ChunkProblem[];
  pageRefs: number[];
}

function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Merges every chunk's map output, deduping near-identical items (matched by
// normalized text — the overlap pages between adjacent chunks are the main
// source of exact repeats) and ranking by mention frequency as a proxy for
// exam-relevance, per docs/studysheet-build-prompt.md §7 stage 6. No AI call.
export function reduceChunks(chunkResults: ChunkExtraction[]): ReducedContent {
  const definitionsByTerm = new Map<string, RankedDefinition>();
  const keyPointsByText = new Map<string, RankedKeyPoint>();
  const formulasByExpr = new Map<string, ChunkFormula>();
  const problemsByStatement = new Map<string, ChunkProblem>();

  for (const chunk of chunkResults) {
    for (const def of chunk.definitions) {
      const key = normalizeKey(def.term);
      const existing = definitionsByTerm.get(key);
      if (existing) existing.mentionCount += 1;
      else definitionsByTerm.set(key, { ...def, mentionCount: 1 });
    }

    for (const kp of chunk.keyPoints) {
      const key = normalizeKey(kp.text);
      const existing = keyPointsByText.get(key);
      if (existing) existing.mentionCount += 1;
      else keyPointsByText.set(key, { ...kp, mentionCount: 1 });
    }

    for (const formula of chunk.formulas) {
      const key = normalizeKey(formula.expression);
      if (!formulasByExpr.has(key)) formulasByExpr.set(key, formula);
    }

    for (const problem of chunk.problems) {
      const key = normalizeKey(problem.statement);
      if (!problemsByStatement.has(key)) problemsByStatement.set(key, problem);
    }
  }

  const pageRefs = [...new Set(chunkResults.flatMap((c) => c.pageRefs))].sort((a, b) => a - b);

  return {
    definitions: [...definitionsByTerm.values()].sort((a, b) => b.mentionCount - a.mentionCount),
    keyPoints: [...keyPointsByText.values()].sort((a, b) => b.mentionCount - a.mentionCount),
    formulas: [...formulasByExpr.values()],
    problems: [...problemsByStatement.values()],
    pageRefs,
  };
}
