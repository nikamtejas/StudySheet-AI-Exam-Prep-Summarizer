import { describe, it, expect } from 'vitest';
import { generateCards, type GenerateCardsInput } from '../src/pipeline/deckGeneration';

function baseInput(overrides: Partial<GenerateCardsInput> = {}): GenerateCardsInput {
  return {
    sections: [],
    definitions: [],
    examQuestions: [],
    problems: [],
    ...overrides,
  };
}

describe('generateCards — basic (term -> definition)', () => {
  it('produces one basic card per definition', () => {
    const cards = generateCards(
      baseInput({
        definitions: [
          { term: 'Inertia', definition: 'Resistance to a change in motion.', pageRef: 4, confidence: 'high' },
        ],
      }),
    );
    expect(cards).toContainEqual({
      front: 'Inertia',
      back: 'Resistance to a change in motion.',
      kind: 'basic',
      pageRef: 4,
    });
  });
});

describe('generateCards — method (problem statement -> strategy)', () => {
  it('uses the strategy, not the full solution', () => {
    const problem = {
      problem: 'A 2kg block accelerates at 3 m/s^2. Find the net force.',
      subject: 'physics' as const,
      given: ['mass = 2kg', 'acceleration = 3 m/s^2'],
      goal: 'Find the net force',
      strategy: 'Apply Newton\'s second law: F = ma.',
      steps: [],
      answer: { value: '6', units: 'N' },
      check: 'Units check out.',
      commonMistake: 'Forgetting units.',
      memoryHook: 'F = ma, always.',
      pageRef: 12,
      verified: true,
    };
    const cards = generateCards(baseInput({ problems: [problem] }));
    expect(cards).toContainEqual({
      front: problem.problem,
      back: problem.strategy,
      kind: 'method',
      pageRef: 12,
    });
    // The full solution (steps/answer/check) must never leak into the card.
    expect(cards.some((c) => c.back.includes('6'))).toBe(false);
  });
});

describe('generateCards — exam (question -> hint)', () => {
  it('generates a card when a hint exists', () => {
    const cards = generateCards(
      baseInput({ examQuestions: [{ q: 'State Newton\'s second law.', hint: 'F = ma', pageRef: 3 }] }),
    );
    expect(cards).toContainEqual({ front: "State Newton's second law.", back: 'F = ma', kind: 'exam', pageRef: 3 });
  });

  it('skips exam questions with no hint rather than fabricating an answer', () => {
    const cards = generateCards(
      baseInput({ examQuestions: [{ q: 'Explain entropy in your own words.', pageRef: 9 }] }),
    );
    expect(cards.filter((c) => c.kind === 'exam')).toHaveLength(0);
  });
});

describe('generateCards — cloze (from section highlights)', () => {
  it('wraps the highlighted text in cloze markup within its sentence', () => {
    const cards = generateCards(
      baseInput({
        sections: [
          {
            type: 'core-concepts',
            title: 'Core concepts',
            body: 'Inertia is the tendency to resist changes in motion. Force equals mass times acceleration.',
            highlights: [{ text: 'tendency to resist changes in motion', kind: 'definition', pageRef: 4 }],
          },
        ],
      }),
    );
    const cloze = cards.find((c) => c.kind === 'cloze');
    expect(cloze).toBeDefined();
    expect(cloze?.front).toBe('Inertia is the {{c1::tendency to resist changes in motion}}.');
    expect(cloze?.back).toBe('tendency to resist changes in motion');
    expect(cloze?.pageRef).toBe(4);
  });

  it('only includes the sentence containing the highlight, not the whole section body', () => {
    const cards = generateCards(
      baseInput({
        sections: [
          {
            type: 'core-concepts',
            title: 'Core concepts',
            body: 'First unrelated sentence here. Second sentence has the important bit. Third sentence is also unrelated.',
            highlights: [{ text: 'important bit', kind: 'exam-critical', pageRef: 1 }],
          },
        ],
      }),
    );
    const cloze = cards.find((c) => c.kind === 'cloze');
    expect(cloze?.front).toBe('Second sentence has the {{c1::important bit}}.');
    expect(cloze?.front).not.toContain('First unrelated');
    expect(cloze?.front).not.toContain('Third sentence');
  });

  it('skips a highlight whose text cannot be found verbatim in the body — never fabricates a sentence', () => {
    const cards = generateCards(
      baseInput({
        sections: [
          {
            type: 'core-concepts',
            title: 'Core concepts',
            body: 'This body does not contain the highlighted phrase at all.',
            highlights: [{ text: 'a phrase that was never actually in the body', kind: 'definition', pageRef: 2 }],
          },
        ],
      }),
    );
    expect(cards.filter((c) => c.kind === 'cloze')).toHaveLength(0);
  });

  it('generates one cloze card per highlight across multiple sections', () => {
    const cards = generateCards(
      baseInput({
        sections: [
          {
            type: 'core-concepts',
            title: 'A',
            body: 'The first key fact matters a lot.',
            highlights: [{ text: 'first key fact', kind: 'definition', pageRef: 1 }],
          },
          {
            type: 'formulas',
            title: 'B',
            body: 'The second key fact also matters.',
            highlights: [{ text: 'second key fact', kind: 'exam-critical', pageRef: 2 }],
          },
        ],
      }),
    );
    expect(cards.filter((c) => c.kind === 'cloze')).toHaveLength(2);
  });
});

describe('generateCards — combined', () => {
  it('returns an empty array for an empty summary rather than throwing', () => {
    expect(generateCards(baseInput())).toEqual([]);
  });
});
