import { z } from 'zod';
import { callStructured } from '../ai/client';
import { SectionSchema, DefinitionSchema, ExamQuestionSchema } from '../contracts';
import type { Depth } from '../contracts';
import type { ReducedContent } from './reduce';

// What the model produces. `connections` is deliberately absent — M2 is
// single-document scope (see cli/summarize.ts); cross-document connections
// are a multi-file feature layered on top later.
export const SynthesisOutputSchema = z.object({
  sections: z.array(SectionSchema),
  definitions: z.array(DefinitionSchema),
  examQuestions: z.array(ExamQuestionSchema),
});
export type SynthesisOutput = z.infer<typeof SynthesisOutputSchema>;

const SYNTHESIS_SYSTEM_PROMPT = `You are writing the final exam-revision study sheet from pre-extracted definitions, key points, formulas, and problem statements pulled from a single source document. Every claim must be traceable to the material provided — never introduce facts that aren't in it.

Produce these sections (type / title / body / highlights):
- "in-one-minute": 4-6 plain-language sentences covering the whole topic. No highlights.
- "core-concepts": short paragraphs built from the key points provided, each with one bolded takeaway line. Mark the takeaway as a highlight with kind "exam-critical".
- "formulas": only if formulas were provided — list each with a one-line plain-language explanation. Omit this section entirely if no formulas were provided.
- "common-confusions": pairs of terms or ideas students mix up, only if genuinely evident from the definitions. Omit this section if nothing is confusable.
- "page-map": one line describing the page range covered, e.g. "Covered: pp. 4-17". If any pages could not be read at all (listed below as UNREADABLE PAGES), say so plainly here — e.g. "Pages 12, 15 could not be read (poor scan quality) and are not covered." Never omit this if unreadable pages were provided; never guess at their content.
Do not produce an "exam-questions" section — those go in the separate examQuestions field below, not in sections.

Also produce:
- definitions: the most exam-relevant terms — if there are many, keep only what a student most needs, not every single one. Each needs a one-sentence definition, its page reference, and a confidence: "high" if the source states it precisely, "low" if you had to paraphrase or infer it.
- examQuestions: 5-8 likely exam questions derived from what the source emphasizes (repetition, formulas, flagged problems), each with an optional hint and a page reference.

Highlighting rules: "definition" highlights mark named terms, "exam-critical" highlights mark facts/conditions/exceptions likely to be tested. Use sparingly — most sentences carry no highlight at all.

Depth setting: {{depth}}. "crash" keeps only the essentials (roughly 1 output page per 10 source pages). "balanced" is normal detail. "deep" keeps derivations and worked examples where the source has them.

Output strict JSON matching the schema.`;

function buildUserContent(reduced: ReducedContent, depth: Depth): string {
  const lines: string[] = [];
  lines.push(`Depth: ${depth}`);
  lines.push(`Source pages: ${reduced.pageRefs.join(', ') || 'none'}`);
  lines.push('');
  lines.push('DEFINITIONS FOUND:');
  for (const def of reduced.definitions) {
    lines.push(`- [p.${def.pageRef}] ${def.term}: ${def.definition} (mentioned ${def.mentionCount}x)`);
  }
  lines.push('');
  lines.push('KEY POINTS FOUND:');
  for (const kp of reduced.keyPoints) {
    lines.push(`- [p.${kp.pageRef}] ${kp.text} (mentioned ${kp.mentionCount}x)`);
  }
  lines.push('');
  lines.push('FORMULAS FOUND:');
  for (const formula of reduced.formulas) {
    lines.push(`- [p.${formula.pageRef}] ${formula.expression} — ${formula.description}`);
  }
  lines.push('');
  lines.push('PROBLEMS FOUND (for context only — do not solve them here):');
  for (const problem of reduced.problems) {
    lines.push(`- [p.${problem.pageRef}] ${problem.statement}`);
  }
  if (reduced.unreadablePages.length > 0) {
    lines.push('');
    lines.push(`UNREADABLE PAGES (could not be transcribed): ${reduced.unreadablePages.join(', ')}`);
  }
  return lines.join('\n');
}

export async function synthesize(reduced: ReducedContent, depth: Depth) {
  const system = SYNTHESIS_SYSTEM_PROMPT.replace('{{depth}}', depth);
  return callStructured({
    model: 'opus',
    system,
    userContent: buildUserContent(reduced, depth),
    schema: SynthesisOutputSchema,
    maxTokens: 8192,
    thinking: true,
  });
}
