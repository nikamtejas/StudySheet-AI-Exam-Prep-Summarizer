import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { mapVisionBatch } from '../src/pipeline/mapVision';

function textResponse(payload: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: { input_tokens: 200, output_tokens: 80 },
  };
}

const emptyExtraction = {
  definitions: [],
  keyPoints: [],
  formulas: [],
  problems: [],
  pageRefs: [1, 2],
  unreadablePages: [],
};

describe('mapVisionBatch', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockBetaCreate.mockReset();
    mockFilesUpload.mockReset();
    mockFilesDelete.mockReset();
  });

  it('uploads each page once, references them by file_id in page order, and cleans up afterward', async () => {
    mockFilesUpload
      .mockResolvedValueOnce({ id: 'file_page1' })
      .mockResolvedValueOnce({ id: 'file_page2' });
    mockBetaCreate.mockResolvedValueOnce(textResponse(emptyExtraction));

    const result = await mapVisionBatch([
      { page: 2, jpegBuffer: Buffer.from('page2') },
      { page: 1, jpegBuffer: Buffer.from('page1') },
    ]);

    expect(result.data.pageRefs).toEqual([1, 2]);
    expect(mockFilesUpload).toHaveBeenCalledTimes(2);

    // Uploaded in page order (1 before 2) despite input being out of order.
    expect(mockFilesUpload.mock.calls[0]?.[0].file.filename).toBe('page-1.jpg');
    expect(mockFilesUpload.mock.calls[1]?.[0].file.filename).toBe('page-2.jpg');

    const requestContent = mockBetaCreate.mock.calls[0]?.[0].messages[0].content as Array<{
      type: string;
      text?: string;
      source?: { file_id: string };
    }>;
    expect(requestContent).toEqual([
      { type: 'text', text: 'Page 1:' },
      { type: 'image', source: { type: 'file', file_id: 'file_page1' } },
      { type: 'text', text: 'Page 2:' },
      { type: 'image', source: { type: 'file', file_id: 'file_page2' } },
    ]);

    // Both uploaded files are cleaned up once the call finishes.
    expect(mockFilesDelete).toHaveBeenCalledTimes(2);
    expect(mockFilesDelete.mock.calls.map((c) => c[0]).sort()).toEqual(['file_page1', 'file_page2']);
  });

  it('passes through low-confidence readings and unreadable pages from the model response', async () => {
    mockFilesUpload.mockResolvedValueOnce({ id: 'file_page1' });
    mockBetaCreate.mockResolvedValueOnce(
      textResponse({
        definitions: [{ term: 'Entropy', definition: 'A messy guess', pageRef: 1, confidence: 'low' }],
        keyPoints: [],
        formulas: [],
        problems: [],
        pageRefs: [1, 2],
        unreadablePages: [2],
      }),
    );

    const result = await mapVisionBatch([{ page: 1, jpegBuffer: Buffer.from('x') }]);

    expect(result.data.definitions[0]?.confidence).toBe('low');
    expect(result.data.unreadablePages).toEqual([2]);
  });

  it('still deletes uploaded files even when the mapping call throws', async () => {
    mockFilesUpload.mockResolvedValueOnce({ id: 'file_page1' });
    mockBetaCreate.mockRejectedValueOnce(new Error('simulated failure'));

    await expect(mapVisionBatch([{ page: 1, jpegBuffer: Buffer.from('x') }])).rejects.toThrow(
      'simulated failure',
    );

    expect(mockFilesDelete).toHaveBeenCalledWith('file_page1', { betas: ['files-api-2025-04-14'] });
  });
});
