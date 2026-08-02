import { describe, it, expect } from 'vitest';
import { describeError } from '../src/lib/errors';

describe('describeError', () => {
  it('returns a normal error message unchanged', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('falls back to the first inner error for an AggregateError with no top-level message', () => {
    const err = new AggregateError([new Error('connect ECONNREFUSED 127.0.0.1:9000')], '');
    expect(describeError(err)).toBe('connect ECONNREFUSED 127.0.0.1:9000');
  });

  it('falls back to an error code when message and inner errors are both empty', () => {
    const err = new Error('');
    (err as Error & { code?: string }).code = 'ECONNREFUSED';
    expect(describeError(err)).toBe('ECONNREFUSED');
  });

  it('stringifies non-Error values', () => {
    expect(describeError('plain string failure')).toBe('plain string failure');
  });
});
