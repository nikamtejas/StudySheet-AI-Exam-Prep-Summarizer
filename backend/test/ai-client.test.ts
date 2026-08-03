import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const mockCreate = vi.fn();
const mockBetaCreate = vi.fn();
const mockFilesUpload = vi.fn();
const mockFilesDelete = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
    beta: {
      messages: { create: mockBetaCreate },
      files: { upload: mockFilesUpload, delete: mockFilesDelete },
    },
  })),
  toFile: vi.fn().mockImplementation(async (buffer: Buffer, filename: string) => ({ buffer, filename })),
}));

vi.mock('../src/config/env', () => ({
  env: { ANTHROPIC_API_KEY: 'test-key' },
}));

import { costCents, callStructured, uploadFile, deleteFile } from '../src/ai/client';

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
    // reliability invariant (docs/studysheet-milestones.md #4). Message
    // content is always a block array (text and/or image-by-file_id blocks).
    const secondCallArgs = mockCreate.mock.calls[1]?.[0];
    const secondContentBlocks = secondCallArgs.messages[0].content as Array<{ type: string; text?: string }>;
    const combinedText = secondContentBlocks.map((b) => b.text ?? '').join('\n');
    expect(combinedText).toContain('failed validation');
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

describe('vision path (Files API)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockBetaCreate.mockReset();
    mockFilesUpload.mockReset();
    mockFilesDelete.mockReset();
  });

  it('uploadFile calls the beta Files API and returns the file id', async () => {
    mockFilesUpload.mockResolvedValueOnce({ id: 'file_abc123' });

    const fileId = await uploadFile(Buffer.from('fake jpeg bytes'), 'page-1.jpg', 'image/jpeg');

    expect(fileId).toBe('file_abc123');
    expect(mockFilesUpload).toHaveBeenCalledTimes(1);
    const uploadArgs = mockFilesUpload.mock.calls[0]?.[0];
    expect(uploadArgs.betas).toEqual(['files-api-2025-04-14']);
  });

  it('deleteFile calls the beta Files API delete endpoint', async () => {
    mockFilesDelete.mockResolvedValueOnce({ id: 'file_abc123', type: 'file_deleted' });
    await deleteFile('file_abc123');
    expect(mockFilesDelete).toHaveBeenCalledWith('file_abc123', { betas: ['files-api-2025-04-14'] });
  });

  it('routes image-block requests to the beta endpoint with the Files API header, not the GA endpoint', async () => {
    mockBetaCreate.mockResolvedValueOnce(textResponse({ term: 'Entropy', definition: 'From an image.' }));

    const result = await callStructured({
      model: 'sonnet',
      system: 'sys',
      userContent: [
        { type: 'text', text: 'Read this page:' },
        { type: 'image', fileId: 'file_abc123' },
      ],
      schema,
    });

    expect(result.data).toEqual({ term: 'Entropy', definition: 'From an image.' });
    expect(mockBetaCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();

    const call = mockBetaCreate.mock.calls[0]?.[0];
    expect(call.betas).toEqual(['files-api-2025-04-14']);
    const content = call.messages[0].content as Array<{ type: string; source?: { file_id: string } }>;
    expect(content[1]).toEqual({ type: 'image', source: { type: 'file', file_id: 'file_abc123' } });
  });

  it('repair retry on a vision call reuses the same file_id rather than re-uploading', async () => {
    mockBetaCreate
      .mockResolvedValueOnce(textResponse({ term: 'Entropy' })) // missing definition — fails
      .mockResolvedValueOnce(textResponse({ term: 'Entropy', definition: 'Fixed.' }));

    const result = await callStructured({
      model: 'sonnet',
      system: 'sys',
      userContent: [{ type: 'image', fileId: 'file_abc123' }],
      schema,
    });

    expect(result.repaired).toBe(true);
    expect(mockBetaCreate).toHaveBeenCalledTimes(2);
    // No upload calls happen inside callStructured at all — the caller
    // uploads once, up front, and passes the file_id in on every attempt.
    expect(mockFilesUpload).not.toHaveBeenCalled();
    const secondCall = mockBetaCreate.mock.calls[1]?.[0];
    const secondContent = secondCall.messages[0].content as Array<{ type: string; source?: { file_id: string } }>;
    expect(secondContent[0]).toEqual({ type: 'image', source: { type: 'file', file_id: 'file_abc123' } });
  });
});
