// Parses the {{c1::term}} markup a cloze Card's `front` carries verbatim for
// Anki export fidelity (backend's pipeline/export/ankiTsv.ts) into the three
// parts an in-app review card needs to render a blank-until-revealed span.
export interface ParsedCloze {
  before: string;
  answer: string;
  after: string;
}

export function parseCloze(front: string): ParsedCloze | null {
  const match = front.match(/^([\s\S]*?)\{\{c\d+::([\s\S]*?)\}\}([\s\S]*)$/);
  if (!match) return null;
  const [, before, answer, after] = match;
  return { before: before ?? '', answer: answer ?? '', after: after ?? '' };
}
