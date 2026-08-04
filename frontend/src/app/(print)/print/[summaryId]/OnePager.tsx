import type { ReactNode } from 'react';
import type { SummaryDTO } from '@/contracts';
import { renderBody } from '@/lib/highlight';

interface OnePagerItem {
  // Lower priority is dropped first. Ranges are spaced out (100s) so any
  // section-level block outranks every item of a lower-priority kind
  // regardless of count.
  priority: number;
  node: ReactNode;
}

const EXAM_QUESTION_CAP = 3;

// "Everything compressed onto a single A4 sheet ... definitions, formulas,
// the three things most likely to be asked" (docs/studysheet-build-prompt.md
// §5) — that ordering is also the priority ordering here: definitions and
// formulas are the bulk of the value, a handful of exam questions are a
// bonus. The backend's render service (M6, pipeline/orchestrate.ts's sibling
// render path) increments `trimLevel` and re-renders until the resulting PDF
// fits one page — dropping content here, never shrinking type below a floor
// (docs/studysheet-milestones.md M6).
function buildItems(summary: SummaryDTO): OnePagerItem[] {
  const items: OnePagerItem[] = [];

  const inOneMinute = summary.sections.find((s) => s.type === 'in-one-minute');
  if (inOneMinute) {
    items.push({
      priority: 1000,
      node: (
        <section key="one-minute" className="section">
          <h2>In one minute</h2>
          {renderBody(inOneMinute.body, inOneMinute.highlights)}
        </section>
      ),
    });
  }

  const formulas = summary.sections.find((s) => s.type === 'formulas');
  if (formulas) {
    items.push({
      priority: 900,
      node: (
        <section key="formulas" className="section">
          <h2>Formulas</h2>
          {renderBody(formulas.body, formulas.highlights)}
        </section>
      ),
    });
  }

  summary.definitions.forEach((def, i) => {
    items.push({
      priority: 800 - i,
      node: (
        <div key={`def-${i}`} className="definition-row">
          <strong>{def.term}</strong>: {def.definition}
        </div>
      ),
    });
  });

  if (summary.examQuestions.length > 0) {
    items.push({
      priority: 700,
      node: (
        <section key="exam-questions" className="section">
          <h2>Likely to be asked</h2>
          <ol>
            {summary.examQuestions.slice(0, EXAM_QUESTION_CAP).map((q, i) => (
              <li key={i}>{q.q}</li>
            ))}
          </ol>
        </section>
      ),
    });
  }

  return items.sort((a, b) => a.priority - b.priority);
}

export function OnePager({ summary, trimLevel }: { summary: SummaryDTO; trimLevel: number }) {
  const items = buildItems(summary);
  const shown = items.slice(Math.min(Math.max(trimLevel, 0), items.length));

  return (
    <article className="one-pager">
      <h1>One-pager</h1>
      {shown.map((item) => item.node)}
    </article>
  );
}
