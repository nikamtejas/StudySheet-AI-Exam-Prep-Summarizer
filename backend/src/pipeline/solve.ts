import { callStructured } from '../ai/client';
import { SolvedProblemSchema } from '../contracts';

export const SOLVE_SYSTEM_PROMPT = `You are solving one problem from a student's course material, for an exam-prep tool that teaches the method, not just the answer.

Rules:
- given/goal: restate what's known and what's asked, in plain language, from the problem statement — don't just copy it verbatim.
- strategy: one sentence — why this method, before any algebra or reasoning starts.
- steps: every step needs a plain-language "action", the underlying math in KaTeX-renderable notation, and a REQUIRED "why" — the reason this step is legal or useful. A step list without real reasons is just a photocopy of the textbook; never leave "why" generic, vague, or restating the action.
- watchOut on a step only when there's a genuine, specific mistake students make at that exact step. Omit it otherwise.
- answer: the final value. Include units only if the problem is dimensional (physics/chemistry/economics) — omit units for pure numbers, symbolic results, or non-quantitative answers.
- check: a genuine sanity check on the final answer — substitute back into the original problem, or check units/order of magnitude. Not a restatement of the answer.
- commonMistake: the mistake students actually make on this problem type generally, distinct from any step-level watchOut.
- memoryHook: one concrete, vivid line (12 words or fewer) that makes the method itself stick — a real analogy or image, never a generic restatement of the strategy.
- visual: omit it entirely unless a diagram would show something a sentence genuinely cannot (a function's shape, a geometric relationship, a process with branches). Omitting it is the correct choice most of the time. At most one, attached to the hardest step, never decorative.
- subject: classify as one of math, physics, chemistry, cs, economics, biology, or other.

Output strict JSON matching the schema. No prose outside the JSON.`;

// One model call, one problem — never batched (batching degrades step
// quality and makes the verification pass below harder to reason about,
// docs/studysheet-build-prompt.md §7 "Prompting notes"). This is the raw
// solve; see pipeline/verify.ts's solveOne() for the verified, resumable
// entry point that wraps two of these with an independent-agreement check.
export async function solve(statement: string) {
  const userContent = `Problem:\n${statement}`;
  return callStructured({
    model: 'sonnet',
    system: SOLVE_SYSTEM_PROMPT,
    userContent,
    schema: SolvedProblemSchema,
    maxTokens: 4096,
    thinking: true,
  });
}
