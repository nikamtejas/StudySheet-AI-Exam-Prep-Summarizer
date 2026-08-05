import { describe, it, expect } from 'vitest';
import { exportAnkiTsv } from '../src/pipeline/export/ankiTsv';
import { exportQuizletCsv } from '../src/pipeline/export/quizletCsv';
import type { CardDTO } from '../src/contracts';

function card(overrides: Partial<CardDTO> & Pick<CardDTO, 'front' | 'back' | 'kind'>): CardDTO {
  return {
    id: 'card-1',
    deckId: 'deck-1',
    userId: 'user-1',
    pageRef: 1,
    srs: { ease: 2.5, intervalDays: 0, dueAt: new Date().toISOString(), reps: 0, lapses: 0 },
    ...overrides,
  };
}

describe('exportAnkiTsv', () => {
  it('puts basic/method/exam cards in the basic blob as Front\\tBack', () => {
    const result = exportAnkiTsv([
      card({ front: 'Inertia', back: 'Resists change in motion.', kind: 'basic' }),
      card({ front: 'Problem statement', back: 'Strategy text', kind: 'method' }),
    ]);
    expect(result.basic).toBe('Inertia\tResists change in motion.\nProblem statement\tStrategy text');
    expect(result.cloze).toBe('');
  });

  it('puts cloze cards in the cloze blob as a single field, cloze markup intact', () => {
    const result = exportAnkiTsv([
      card({ front: 'Inertia is the {{c1::tendency to resist change}}.', back: 'tendency to resist change', kind: 'cloze' }),
    ]);
    expect(result.cloze).toBe('Inertia is the {{c1::tendency to resist change}}.');
    expect(result.basic).toBe('');
  });

  it('strips literal tabs and converts newlines so a row never gets misread as extra fields', () => {
    const result = exportAnkiTsv([card({ front: 'Has\ta tab', back: 'Has\na newline', kind: 'basic' })]);
    expect(result.basic).toBe('Has a tab\tHas<br>a newline');
  });

  it('returns empty strings for an empty deck', () => {
    expect(exportAnkiTsv([])).toEqual({ basic: '', cloze: '' });
  });
});

describe('exportQuizletCsv', () => {
  it('formats basic cards as term,definition', () => {
    const csv = exportQuizletCsv([card({ front: 'Inertia', back: 'Resists change in motion.', kind: 'basic' })]);
    expect(csv).toBe('Inertia,Resists change in motion.');
  });

  it('quotes fields containing a comma', () => {
    const csv = exportQuizletCsv([card({ front: 'Force, mass, acceleration', back: 'F=ma', kind: 'basic' })]);
    expect(csv).toBe('"Force, mass, acceleration",F=ma');
  });

  it('doubles embedded quotes', () => {
    const csv = exportQuizletCsv([card({ front: 'The "net" force', back: 'sum of forces', kind: 'basic' })]);
    expect(csv).toBe('"The ""net"" force",sum of forces');
  });

  it('adapts a cloze card into a blanked term and its answer as the definition', () => {
    const csv = exportQuizletCsv([
      card({ front: 'Inertia is the {{c1::tendency to resist change}}.', back: 'tendency to resist change', kind: 'cloze' }),
    ]);
    expect(csv).toBe('Inertia is the ____.,tendency to resist change');
  });

  it('joins multiple cards with newlines', () => {
    const csv = exportQuizletCsv([
      card({ front: 'A', back: '1', kind: 'basic' }),
      card({ front: 'B', back: '2', kind: 'basic' }),
    ]);
    expect(csv).toBe('A,1\nB,2');
  });
});
