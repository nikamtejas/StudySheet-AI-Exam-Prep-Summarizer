import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

vi.mock('../src/config/env', () => ({
  env: { ANTHROPIC_API_KEY: 'test-key' },
}));

import { mapChunk } from '../src/pipeline/map';
import { synthesize } from '../src/pipeline/synthesize';
import type { Chunk } from '../src/pipeline/chunk';
import type { ReducedContent } from '../src/pipeline/reduce';

function textResponse(payload: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

describe('model routing', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('mapChunk calls Sonnet 5, per docs/studysheet-build-prompt.md §6 model routing', async () => {
    mockCreate.mockResolvedValueOnce(
      textResponse({ definitions: [], keyPoints: [], formulas: [], problems: [], pageRefs: [1] }),
    );

    const chunk: Chunk = { index: 0, startPage: 1, endPage: 1, text: '[page 1]\nsome text', overlapsPreviousBy: 0 };
    await mapChunk(chunk);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]?.[0].model).toBe('claude-sonnet-5');
  });

  it('synthesize calls Opus 4.8 with adaptive thinking enabled', async () => {
    mockCreate.mockResolvedValueOnce(textResponse({ sections: [], definitions: [], examQuestions: [] }));

    const reduced: ReducedContent = { definitions: [], keyPoints: [], formulas: [], problems: [], pageRefs: [] };
    await synthesize(reduced, 'balanced');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0]?.[0];
    expect(call.model).toBe('claude-opus-4-8');
    expect(call.thinking).toEqual({ type: 'adaptive' });
  });
});
