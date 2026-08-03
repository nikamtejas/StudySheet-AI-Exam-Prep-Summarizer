import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

vi.mock('../src/config/env', () => ({
  env: { ANTHROPIC_API_KEY: 'test-key' },
}));

import { costCents, callStructured } from '../src/ai/client';

const schema = z.object({ term: z.string(), definition: z.string() });

function textResponse(payload: unknown, inputTokens = 100, outputTokens = 50) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

describe('costCents', () => {
  it('computes cost from per-model rates', () => {
    // Haiku: $1/$5 per MTok
    expect(costCents('haiku', { inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(100);
    expect(costCents('haiku', { inputTokens: 0, outputTokens: 1_000_000 })).toBeCloseTo(500);
    // Sonnet: $3/$15 per MTok
    expect(costCents('sonnet', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(1800);
    // Opus: $5/$25 per MTok
    expect(costCents('opus', { inputTokens: 500_000, outputTokens: 0 })).toBeCloseTo(250);
  });

  it('scales linearly for small token counts', () => {
    expect(costCents('haiku', { inputTokens: 1000, outputTokens: 0 })).toBeCloseTo(0.1);
  });
});

describe('callStructured', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns validated data on the first attempt', async () => {
    mockCreate.mockResolvedValueOnce(textResponse({ term: 'Entropy', definition: 'A measure of disorder.' }));

    const result = await callStructured({
      model: 'sonnet',
      system: 'system prompt',
      userContent: 'extract the definition',
      schema,
    });

    expect(result.repaired).toBe(false);
    expect(result.data).toEqual({ term: 'Entropy', definition: 'A measure of disorder.' });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.costCents).toBeGreaterThan(0);
  });

  it('retries once with the validation error appended, and succeeds', async () => {
    mockCreate
      .mockResolvedValueOnce(textResponse({ term: 'Entropy' })) // missing `definition` — fails schema
      .mockResolvedValueOnce(textResponse({ term: 'Entropy', definition: 'Fixed.' }));

    const result = await callStructured({
      model: 'sonnet',
      system: 'system prompt',
      userContent: 'extract the definition',
      schema,
    });

    expect(result.repaired).toBe(true);
    expect(result.data).toEqual({ term: 'Entropy', definition: 'Fixed.' });
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // Second call's prompt must include the validation error, per the
    // reliability invariant (docs/studysheet-milestones.md #4).
    const secondCallArgs = mockCreate.mock.calls[1]?.[0];
    const secondUserMessage = secondCallArgs.messages[0].content as string;
    expect(secondUserMessage).toContain('failed validation');
  });

  it('throws after the repair retry also fails validation', async () => {
    mockCreate
      .mockResolvedValueOnce(textResponse({ term: 'Entropy' }))
      .mockResolvedValueOnce(textResponse({ term: 'Entropy' }));

    await expect(
      callStructured({ model: 'sonnet', system: 'sys', userContent: 'go', schema }),
    ).rejects.toThrow(/failed schema validation twice/);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('treats malformed JSON the same as a schema failure and still retries', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not json at all' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    mockCreate.mockResolvedValueOnce(textResponse({ term: 'Entropy', definition: 'Fixed.' }));

    const result = await callStructured({
      model: 'haiku',
      system: 'sys',
      userContent: 'go',
      schema,
    });

    expect(result.repaired).toBe(true);
    expect(result.data.term).toBe('Entropy');
  });
});
