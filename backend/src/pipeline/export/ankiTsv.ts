import type { CardDTO } from '../../contracts';

// Anki's own plain-text import (File > Import, .txt/.tsv, tab-separated)
// lets the user pick the note type and field mapping at import time —
// simpler to get right and to verify by inspection than hand-rolling a
// .apkg (a zipped SQLite database that has to exactly match Anki's internal
// schema). docs/studysheet-build-prompt.md §5 explicitly offers ".apkg via
// genanki-equivalent, or TSV" as interchangeable; TSV was chosen here
// specifically because a binary .apkg's fidelity to a real Anki install
// can't be verified without the Anki desktop app, which isn't available in
// this environment — see memory for the full reasoning.
//
// Two separate blobs, not one file, because Anki's Cloze note type expects
// a single "Text" field containing {{c1::...}} markup — mixing cloze cards
// into the same TSV as Basic cards' Front/Back columns would make the
// single field-mapping choice during import wrong for one kind or the other.
export interface AnkiTsvExport {
  basic: string;
  cloze: string;
}

// A literal tab would be misread as an extra field by Anki's importer, and
// a leading '#' marks a comment line — neither should occur in real card
// content, but this strips/normalizes them defensively rather than risk a
// silently mis-columned import.
function escapeField(value: string): string {
  return value.replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
}

export function exportAnkiTsv(cards: CardDTO[]): AnkiTsvExport {
  const basicRows: string[] = [];
  const clozeRows: string[] = [];

  for (const card of cards) {
    if (card.kind === 'cloze') {
      clozeRows.push(escapeField(card.front));
    } else {
      basicRows.push(`${escapeField(card.front)}\t${escapeField(card.back)}`);
    }
  }

  return { basic: basicRows.join('\n'), cloze: clozeRows.join('\n') };
}
