import { describe, it, expect } from 'vitest';
import { SourceTypeSchema, DepthSchema, HealthStatusSchema } from '../src/contracts';

describe('contracts', () => {
  it('accepts valid source types and rejects unknown ones', () => {
    expect(SourceTypeSchema.parse('handwritten')).toBe('handwritten');
    expect(() => SourceTypeSchema.parse('photocopy')).toThrow();
  });

  it('accepts valid depths', () => {
    expect(DepthSchema.parse('crash')).toBe('crash');
  });

  it('validates a full health status payload', () => {
    const result = HealthStatusSchema.safeParse({
      ok: true,
      service: 'api',
      checks: {
        mongo: { ok: true, latencyMs: 3 },
        redis: { ok: true, latencyMs: 1 },
        storage: { ok: true, latencyMs: 5 },
      },
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});
