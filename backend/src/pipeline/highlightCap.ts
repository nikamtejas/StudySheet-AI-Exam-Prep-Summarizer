import type { Section, Highlight } from '../contracts';

const HIGHLIGHT_CAP_RATIO = 0.15;

// "Weakest" isn't spec-defined, so this is a judgment call: 'definition'
// marks are dropped before 'exam-critical' ones (exam-critical marks are
// explicitly "likely to be tested" — more valuable to preserve), and within
// the same kind, longer highlighted spans are dropped before shorter ones —
// a good highlight is a short, punchy phrase; one spanning half a paragraph
// isn't doing its job as an attention-directing mark.
function dropOrder(a: Highlight, b: Highlight): number {
  if (a.kind !== b.kind) return a.kind === 'exam-critical' ? 1 : -1;
  return b.text.length - a.text.length;
}

// Enforces docs/studysheet-milestones.md M6: "if more than ~15% of a page is
// marked, drop the weakest marks" — before render, never after (a page dense
// with highlights defeats the point of highlighting anything). Pure
// function: never mutates the persisted Summary, only the copy the print
// route actually renders (see api/routes/render.ts).
export function enforceHighlightCap(sections: Section[]): Section[] {
  return sections.map((section) => {
    const bodyLength = Math.max(section.body.length, 1);
    let highlights = section.highlights;
    let highlightedLength = highlights.reduce((sum, h) => sum + h.text.length, 0);

    if (highlightedLength / bodyLength <= HIGHLIGHT_CAP_RATIO) return section;

    const droppable = [...highlights].sort(dropOrder);
    while (highlightedLength / bodyLength > HIGHLIGHT_CAP_RATIO && droppable.length > 0) {
      const dropped = droppable.shift();
      if (!dropped) break;
      highlights = highlights.filter((h) => h !== dropped);
      highlightedLength -= dropped.text.length;
    }

    return { ...section, highlights };
  });
}
