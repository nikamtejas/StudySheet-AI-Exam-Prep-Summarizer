'use client';

import { useState } from 'react';
import { solveOneProblem } from '@/lib/api';
import type { StandaloneSolveResponse } from '@/contracts';
import { ClientMath } from './ClientMath';

// docs/studysheet-build-prompt.md §4: "The student can also type or
// photograph a single problem directly — treat this as a first-class entry
// point, not a hidden feature." Text-only for now, matching the backend
// route (see contracts/problem.ts's SolveRequestSchema comment) — photo
// input would need vision-capable solving, which hasn't been built.
// `visual` isn't rendered here: M5's Visual component depends on mathjs,
// and reusing it here (a client component, since the result only exists
// after a client-side submit) would pull mathjs into this route's bundle
// the same way SummaryPane almost did on the preview page — most solved
// problems omit `visual` anyway ("omitting it is the correct choice most of
// the time"), so this is a deliberate, low-cost scope cut, not an oversight.
export function SolveForm() {
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState<StandaloneSolveResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!problem.trim()) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await solveOneProblem({ problem });
      setResult(response);
    } catch {
      setError("Couldn't solve this problem. Try rephrasing it, or try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-2xl">Solve one problem</h1>
      <p className="text-muted mt-2 text-base">Paste a problem statement — no upload needed.</p>

      <form onSubmit={handleSubmit} className="mt-6">
        <label htmlFor="problem" className="sr-only">
          Problem statement
        </label>
        <textarea
          id="problem"
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          rows={4}
          placeholder="e.g. A 2 kg block accelerates at 3 m/s^2. Find the net force."
          className="border-edge bg-surface w-full rounded-md border p-3 text-sm focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={submitting || !problem.trim()}
          className="bg-amber text-ink mt-4 w-full rounded-md px-6 py-3 text-base font-semibold focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none disabled:opacity-40"
        >
          {submitting ? 'Solving…' : 'Solve this problem'}
        </button>
      </form>

      {error && (
        <p className="mt-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="border-edge mt-8 rounded-md border p-4">
          {!result.verified && <p className="mb-2 text-sm text-amber">{result.verificationNote}</p>}
          <p className="text-sm">
            <strong>Given:</strong> {result.given.join('; ')}
          </p>
          <p className="mt-1 text-sm">
            <strong>Goal:</strong> {result.goal}
          </p>
          <p className="mt-1 text-sm">
            <strong>Strategy:</strong> {result.strategy}
          </p>
          <ol className="mt-3 space-y-3 pl-4">
            {result.steps.map((step) => (
              <li key={step.n} className="text-sm">
                <div>{step.action}</div>
                <div className="mt-0.5">
                  <ClientMath tex={step.math} />
                </div>
                <div className="text-muted mt-0.5 text-xs">Why: {step.why}</div>
                {step.watchOut && <div className="mt-0.5 text-xs text-amber">Watch out: {step.watchOut}</div>}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm">
            <strong>Answer:</strong> <ClientMath tex={result.answer.value} />
            {result.answer.units ? ` ${result.answer.units}` : ''}
          </p>
          <p className="mt-1 text-sm">
            <strong>Check:</strong> {result.check}
          </p>
          <p className="text-muted mt-2 text-xs italic">{result.memoryHook}</p>
        </div>
      )}
    </div>
  );
}
