import type { SummaryDTO } from '@/contracts';
import { renderBody } from '@/lib/highlight';
import { Visual } from '@/components/visuals';
import { InlineMath } from '@/components/Math';
import { PageRefButton } from './PageRefButton';

const SECTION_TITLES: Record<string, string> = {
  'in-one-minute': 'In one minute',
  'core-concepts': 'Core concepts',
  formulas: 'Formulas',
  'exam-questions': 'Exam questions',
  'common-confusions': 'Common confusions',
  connections: 'Connections',
  'page-map': 'Page map',
};

// A server component — stays that way deliberately. Visual/InlineMath are
// M5/M5-era server-only components (no client JS, no hydration); the
// highlight toggle and page-ref jumping are handled entirely by wrapping
// client components (HighlightScope, PageRefButton) so this component and
// its heavier dependencies (mathjs, KaTeX) never enter the client bundle.
export function SummaryPane({ summary }: { summary: SummaryDTO }) {
  return (
    <div className="space-y-8 p-6">
      {summary.sections.map((section, i) => (
        <section key={i}>
          <h2 className="font-display text-lg">{SECTION_TITLES[section.type] ?? section.type}</h2>
          <div className="mt-2 text-sm leading-relaxed">{renderBody(section.body, section.highlights)}</div>
        </section>
      ))}

      {summary.definitions.length > 0 && (
        <section>
          <h2 className="font-display text-lg">Definitions</h2>
          <dl className="mt-2 space-y-2">
            {summary.definitions.map((def, i) => (
              <div key={i} className="text-sm">
                <dt className="inline font-semibold">{def.term}</dt>
                <dd className="inline">
                  {' '}
                  — {def.definition} <PageRefButton page={def.pageRef} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {summary.examQuestions.length > 0 && (
        <section>
          <h2 className="font-display text-lg">Exam questions</h2>
          <ol className="mt-2 space-y-2">
            {summary.examQuestions.map((q, i) => (
              <li key={i} className="text-sm">
                {q.q} <PageRefButton page={q.pageRef} />
                {q.hint && <div className="text-muted mt-0.5">Hint: {q.hint}</div>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {summary.problems.length > 0 && (
        <section>
          <h2 className="font-display text-lg">Problems</h2>
          <div className="mt-2 space-y-6">
            {summary.problems.map((problem, i) => (
              <div key={i} className="border-edge rounded-md border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">Problem {i + 1}</h3>
                  <PageRefButton page={problem.pageRef} />
                </div>
                {!problem.verified && <p className="mt-1 text-sm text-amber">{problem.verificationNote}</p>}
                <p className="mt-2 text-sm">{problem.problem}</p>
                <ol className="mt-3 space-y-2 pl-4">
                  {problem.steps.map((step) => (
                    <li key={step.n} className="text-sm">
                      <div>{step.action}</div>
                      <div className="mt-0.5">
                        <InlineMath tex={step.math} />
                      </div>
                      <div className="text-muted mt-0.5 text-xs">Why: {step.why}</div>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-sm">
                  <strong>Answer:</strong> <InlineMath tex={problem.answer.value} />
                  {problem.answer.units ? ` ${problem.answer.units}` : ''}
                </p>
                {problem.visual && <Visual spec={problem.visual} />}
                <p className="text-muted mt-2 text-xs italic">{problem.memoryHook}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
