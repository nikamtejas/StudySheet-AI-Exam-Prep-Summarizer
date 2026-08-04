import type { ReactNode } from 'react';
import type { Highlight } from '@/contracts';

interface Match {
  start: number;
  end: number;
  kind: Highlight['kind'];
}

// Highlights carry their literal text, not offsets, so this finds each
// highlight's first occurrence in the paragraph and wraps it. Overlapping
// matches (two highlights claiming the same span) keep whichever starts
// first — a highlight is never nested inside another. `visible: false`
// (the preview's highlight-toggle, docs/studysheet-milestones.md M7) skips
// the <mark> wrapper entirely rather than hiding it with CSS, so toggling
// off is a real content simplification, not a visual trick.
export function renderHighlighted(text: string, highlights: Highlight[], visible = true): ReactNode[] {
  if (highlights.length === 0 || !visible) return [text];

  const matches: Match[] = [];
  for (const h of highlights) {
    if (!h.text) continue;
    const idx = text.indexOf(h.text);
    if (idx !== -1) matches.push({ start: idx, end: idx + h.text.length, kind: h.kind });
  }
  matches.sort((a, b) => a.start - b.start);

  const nonOverlapping: Match[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      nonOverlapping.push(m);
      lastEnd = m.end;
    }
  }

  if (nonOverlapping.length === 0) return [text];

  const nodes: ReactNode[] = [];
  let cursor = 0;
  nonOverlapping.forEach((m, i) => {
    if (m.start > cursor) nodes.push(text.slice(cursor, m.start));
    nodes.push(
      <mark key={i} className={m.kind === 'exam-critical' ? 'hl-exam-critical' : 'hl-definition'}>
        {text.slice(m.start, m.end)}
      </mark>,
    );
    cursor = m.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

// Sections' body text uses a blank line between paragraphs — split and wrap
// each independently so highlight matching never crosses a paragraph break.
export function renderBody(body: string, highlights: Highlight[], visible = true): ReactNode {
  const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return paragraphs.map((paragraph, i) => <p key={i}>{renderHighlighted(paragraph, highlights, visible)}</p>);
}
