import type { CardKind, Definition, ExamQuestion, Section, VerifiedProblem } from '../contracts';

// docs/studysheet-build-prompt.md §5: "Every summary produces a deck
// automatically... no model calls" — every function in this file is a pure
// string/array transform over data M2/M4 already produced. Persisting the
// result (turning a CardDraft into a real Card with userId/srs) is
// lib/decks.ts's job, not this file's — keeping this pure is what makes
// "assert zero API calls" a real, checkable property rather than a promise.
export interface CardDraft {
  front: string;
  back: string;
  kind: CardKind;
  pageRef: number;
}

function makeBasicCards(definitions: Definition[]): CardDraft[] {
  return definitions.map((d) => ({ front: d.term, back: d.definition, kind: 'basic', pageRef: d.pageRef }));
}

function makeMethodCards(problems: VerifiedProblem[]): CardDraft[] {
  // Statement -> strategy, deliberately not the full solution (§5: "the
  // strategy is what needs recall") — steps/answer/check stay in the
  // printed summary, not the flashcard.
  return problems.map((p) => ({ front: p.problem, back: p.strategy, kind: 'method', pageRef: p.pageRef }));
}

// No card is generated for an ExamQuestion without a hint — there's no
// stored canonical answer to fall back to anywhere in Summary, and inventing
// one here would violate reliability invariant 5's "never fabricate, always
// degrade visibly" even though this isn't itself an AI call.
function makeExamCards(examQuestions: ExamQuestion[]): CardDraft[] {
  return examQuestions
    .filter((q): q is ExamQuestion & { hint: string } => Boolean(q.hint))
    .map((q) => ({ front: q.q, back: q.hint, kind: 'exam', pageRef: q.pageRef }));
}

const SENTENCE_ENDERS = ['.', '!', '?'];

// Expands outward from a highlight's position to the sentence containing it
// — a plain string heuristic (last/next sentence-ending punctuation), not
// NLP, which is all a cloze card needs: enough surrounding context that the
// blank is answerable from the sentence alone.
function extractSentence(body: string, needleStart: number, needleEnd: number): string {
  let start = 0;
  for (const ch of SENTENCE_ENDERS) {
    const i = body.lastIndexOf(ch, needleStart - 1);
    if (i + 1 > start) start = i + 1;
  }
  let end = body.length;
  for (const ch of SENTENCE_ENDERS) {
    const i = body.indexOf(ch, needleEnd);
    if (i !== -1 && i + 1 < end) end = i + 1;
  }
  return body.slice(start, end).trim();
}

// One cloze card per highlighted span, sourced from the prose (section.body)
// rather than the curated definitions[]/examQuestions[] lists — this is
// what "key points" means distinctly from the term->definition cards
// makeBasicCards already covers from the same summary.
function makeClozeCards(sections: Section[]): CardDraft[] {
  const cards: CardDraft[] = [];
  for (const section of sections) {
    for (const highlight of section.highlights) {
      const idx = section.body.indexOf(highlight.text);
      // The highlight's text not appearing verbatim in its own section body
      // would mean upstream data is inconsistent — skip rather than emit a
      // cloze card with no real sentence behind it.
      if (idx === -1) continue;

      const sentence = extractSentence(section.body, idx, idx + highlight.text.length);
      if (!sentence.includes(highlight.text)) continue;

      const front = sentence.replace(highlight.text, `{{c1::${highlight.text}}}`);
      cards.push({ front, back: highlight.text, kind: 'cloze', pageRef: highlight.pageRef });
    }
  }
  return cards;
}

export interface GenerateCardsInput {
  sections: Section[];
  definitions: Definition[];
  examQuestions: ExamQuestion[];
  problems: VerifiedProblem[];
}

export function generateCards(summary: GenerateCardsInput): CardDraft[] {
  return [
    ...makeBasicCards(summary.definitions),
    ...makeClozeCards(summary.sections),
    ...makeMethodCards(summary.problems),
    ...makeExamCards(summary.examQuestions),
  ];
}
