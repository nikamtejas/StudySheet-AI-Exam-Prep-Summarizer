import type { SummaryDTO } from '@/contracts';
import { Visual } from '@/components/visuals';
import { InlineMath } from '@/components/Math';

// The companion to FullStudySheet's problem cards — numbered to match (array
// position, 1-indexed). Full worked solutions live here, not on the main
// sheet, the way a textbook separates exercises from its answer key.
export function AnswerAppendix({ summary }: { summary: SummaryDTO }) {
  if (summary.problems.length === 0) {
    return (
      <article className="answer-appendix">
        <h1>Answer appendix</h1>
        <p>No solved problems in this document.</p>
      </article>
    );
  }

  return (
    <article className="answer-appendix">
      <h1>Answer appendix</h1>
      {summary.problems.map((problem, i) => (
        <div key={i} className="problem-card">
          <h2>
            Problem {i + 1}
            {!problem.verified && <span className="unverified"> — {problem.verificationNote}</span>}
          </h2>
          <p className="problem-statement">{problem.problem}</p>

          <ol className="steps">
            {problem.steps.map((step) => (
              <li key={step.n}>
                <div className="step-action">{step.action}</div>
                <div className="step-math">
                  <InlineMath tex={step.math} />
                </div>
                <div className="step-why">Why: {step.why}</div>
                {step.watchOut && <div className="step-watch-out">Watch out: {step.watchOut}</div>}
              </li>
            ))}
          </ol>

          <p className="answer">
            <strong>Answer:</strong> <InlineMath tex={problem.answer.value} />
            {problem.answer.units ? ` ${problem.answer.units}` : ''}
          </p>
          <p className="check">
            <strong>Check:</strong> {problem.check}
          </p>
          <p className="common-mistake">
            <strong>Common mistake:</strong> {problem.commonMistake}
          </p>
          {problem.visual && <Visual spec={problem.visual} />}
          <p className="memory-hook">{problem.memoryHook}</p>
        </div>
      ))}
    </article>
  );
}
