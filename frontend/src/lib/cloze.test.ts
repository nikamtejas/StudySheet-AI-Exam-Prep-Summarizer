import { describe, it, expect } from 'vitest';
import { parseCloze } from './cloze';

describe('parseCloze', () => {
  it('splits a sentence around the cloze markup', () => {
    expect(parseCloze('Inertia is the {{c1::tendency to resist changes in motion}}.')).toEqual({
      before: 'Inertia is the ',
      answer: 'tendency to resist changes in motion',
      after: '.',
    });
  });

  it('returns null for a string with no cloze markup', () => {
    expect(parseCloze('A plain sentence with no blanks.')).toBeNull();
  });

  it('handles the blank at the very start or end of the sentence', () => {
    expect(parseCloze('{{c1::Force}} equals mass times acceleration.')).toEqual({
      before: '',
      answer: 'Force',
      after: ' equals mass times acceleration.',
    });
    expect(parseCloze('The formula is {{c1::F=ma}}')).toEqual({
      before: 'The formula is ',
      answer: 'F=ma',
      after: '',
    });
  });
});
