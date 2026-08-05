import type { CardDTO } from '../../contracts';

// Quizlet's bulk-import format is a plain term,definition CSV, one card per
// row — no fill-in-the-blank concept, so a cloze card (whose `front` carries
// {{c1::term}} markup meant for Anki, pipeline/export/ankiTsv.ts) is adapted
// into a term/definition pair: the blanked sentence as the "term" side, the
// removed text as the "definition" side.
function blankClozeSentence(front: string): string {
  return front.replace(/\{\{c\d+::(.*?)\}\}/g, '____');
}

function clozeAnswer(front: string): string {
  return front.match(/\{\{c\d+::(.*?)\}\}/)?.[1] ?? '';
}

// RFC4180: quote a field if it contains the delimiter, a quote, or a
// newline; double up any embedded quotes.
function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportQuizletCsv(cards: CardDTO[]): string {
  return cards
    .map((card) => {
      const term = card.kind === 'cloze' ? blankClozeSentence(card.front) : card.front;
      const definition = card.kind === 'cloze' ? clozeAnswer(card.front) : card.back;
      return `${csvField(term)},${csvField(definition)}`;
    })
    .join('\n');
}
