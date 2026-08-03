import { uploadFile, deleteFile, callStructured, type UserContentBlock } from '../ai/client';
import { ChunkExtractionSchema } from './map';

export interface VisionPageImage {
  page: number;
  jpegBuffer: Buffer;
}

export const MAP_VISION_SYSTEM_PROMPT = `You are transcribing and extracting structured study material from photographed or scanned pages — handwriting, whiteboards, or low-quality scans — for an exam-prep tool.

Rules:
- Read each image carefully. Handwriting varies in legibility — when you are not fully confident in a specific reading, still include it but set confidence: "low" on that item. Never silently guess and present a guess as certain.
- If a page is genuinely illegible (blank, too blurry, cut off, or otherwise unreadable), do not invent content for it — add its page number to unreadablePages instead and skip it for every other category on that page.
- Quote definitions as precisely as the handwriting allows. Only paraphrase when the source is genuinely ambiguous, and mark those confidence: "low".
- Every item must carry the page number it came from — pages are labeled by a "Page N:" marker immediately before each image.
- keyPoints are short, exam-relevant facts, conditions, or exceptions — not a transcription of the whole page.
- formulas: only include formulas or named processes actually present in the source.
- problems: numbered exercises, worked examples, boxed answers, or ∴ / => derivation chains — capture the problem statement only, not a solution.
- If a category has nothing on these pages, return an empty array for it. Do not invent content to fill a category.
- pageRefs is the sorted, de-duplicated list of every page number among these images, including unreadable ones.
- Output strict JSON matching the schema. No prose outside the JSON.`;

// One call per vision batch (≤20 pages, see pipeline/chunkVision.ts), never
// per-page — same "one call per unit of work" discipline as the text path.
// Images are uploaded via the Files API once and referenced by file_id on
// both the first attempt and any repair retry (docs/studysheet-milestones.md
// M3), then deleted once this batch's mapping call (repair retry included)
// has finished.
export async function mapVisionBatch(images: VisionPageImage[]) {
  const sorted = [...images].sort((a, b) => a.page - b.page);
  const uploadedFileIds: string[] = [];

  try {
    const contentBlocks: UserContentBlock[] = [];
    for (const image of sorted) {
      const fileId = await uploadFile(image.jpegBuffer, `page-${image.page}.jpg`, 'image/jpeg');
      uploadedFileIds.push(fileId);
      contentBlocks.push({ type: 'text', text: `Page ${image.page}:` });
      contentBlocks.push({ type: 'image', fileId });
    }

    return await callStructured({
      model: 'sonnet',
      system: MAP_VISION_SYSTEM_PROMPT,
      userContent: contentBlocks,
      schema: ChunkExtractionSchema,
      maxTokens: 4096,
    });
  } finally {
    await Promise.allSettled(uploadedFileIds.map((id) => deleteFile(id)));
  }
}
