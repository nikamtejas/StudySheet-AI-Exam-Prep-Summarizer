import { evaluate, unit } from 'mathjs';
import { solve } from './solve';
import type { TokenUsage } from '../ai/client';
import type { SolvedProblem, VerifiedProblem } from '../contracts';

type SolveAttempt = Awaited<ReturnType<typeof solve>>;

// Loose enough that two independently-correct solves of an irrational-answer
// problem (e.g. a pendulum period) don't spuriously disagree just because
// one wrote "2.01" and the other "2.007" — genuine arithmetic errors are
// virtually always off by far more than 0.5%. Tight enough that it never
// papers over a real mistake.
const NUMERIC_TOLERANCE = 5e-3;
const UNVERIFIED_NOTE = 'Unverified — check with your notes';

function tryEvaluateNumber(expr: string): number | null {
  try {
    const result = evaluate(expr);
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').replace(/[$,]/g, '');
}

// Compares two independently-produced final answers. Numeric answers are
// evaluated (so "1/2" and "0.5" agree); dimensional answers additionally go
// through mathjs unit conversion so "5 m/s" and "18 km/h" agree while a
// genuine dimensional mismatch ("5 m" vs "5 s") fails outright, even if the
// bare numbers happen to match — docs/studysheet-build-prompt.md §4
// "Correctness": "dimensional mismatch fails the problem automatically."
// Non-numeric (symbolic/prose) answers fall back to normalized string equality.
export function answersAgree(a: SolvedProblem['answer'], b: SolvedProblem['answer']): boolean {
  const an = tryEvaluateNumber(a.value);
  const bn = tryEvaluateNumber(b.value);

  if (an === null || bn === null) {
    return normalizeText(a.value) === normalizeText(b.value);
  }

  if (a.units && b.units) {
    try {
      const ua = unit(an, a.units);
      const ub = unit(bn, b.units);
      if (!ua.equalBase(ub)) return false;
      const bInAUnits = ub.toNumber(a.units);
      const scale = Math.max(Math.abs(an), 1);
      return Math.abs(an - bInAUnits) / scale < NUMERIC_TOLERANCE;
    } catch {
      // Unit string mathjs doesn't recognize as a physical unit (e.g.
      // "items", "students") — dimensional checking doesn't apply; fall
      // through to a plain numeric comparison instead.
    }
  }

  const scale = Math.max(Math.abs(an), Math.abs(bn), 1);
  return Math.abs(an - bn) / scale < NUMERIC_TOLERANCE;
}

function sumUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 },
  );
}

// Any two of three attempts agreeing wins — docs/studysheet-build-prompt.md
// §4: "run a third; majority wins". Returns undefined only when all three
// disagree pairwise.
function majorityAttempt(attempts: SolveAttempt[]): SolveAttempt | undefined {
  for (let i = 0; i < attempts.length; i++) {
    for (let j = i + 1; j < attempts.length; j++) {
      if (answersAgree(attempts[i]!.data.answer, attempts[j]!.data.answer)) {
        return attempts[i];
      }
    }
  }
  return undefined;
}

export interface SolveOneResult {
  data: VerifiedProblem;
  usage: TokenUsage;
  costCents: number;
}

// The verified, resumable entry point — also the standalone function a
// future paste/photo single-problem entry point calls directly
// (docs/studysheet-milestones.md M4: "Standalone solveOne() used later by
// the paste/photo entry point"). Wraps solve() with independent re-solving,
// deterministic numeric/unit verification, and a third tie-breaking attempt
// on disagreement. Never drops a problem that fails verification — it's
// returned with `verified: false` and a visible note instead (reliability
// invariant 5).
export async function solveOne(problem: { statement: string; pageRef: number }): Promise<SolveOneResult> {
  // The first two attempts are dispatched together and never see each
  // other's output — "no sight of the first solution" (§4).
  const [first, second] = await Promise.all([solve(problem.statement), solve(problem.statement)]);
  const attempts: SolveAttempt[] = [first, second];

  let winner = answersAgree(first.data.answer, second.data.answer) ? first : undefined;

  if (!winner) {
    const third = await solve(problem.statement);
    attempts.push(third);
    winner = majorityAttempt(attempts);
  }

  const usage = sumUsage(attempts.map((a) => a.usage));
  const costCents = attempts.reduce((sum, a) => sum + a.costCents, 0);

  if (!winner) {
    return {
      data: {
        ...first.data,
        pageRef: problem.pageRef,
        verified: false,
        verificationNote: UNVERIFIED_NOTE,
      },
      usage,
      costCents,
    };
  }

  return {
    data: { ...winner.data, pageRef: problem.pageRef, verified: true },
    usage,
    costCents,
  };
}
