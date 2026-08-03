import { JobModel } from '../models/Job';
import { SummaryModel } from '../models/Summary';
import { DocumentModel } from '../models/Document';
import { downloadObject } from '../lib/storage';
import { logger } from '../lib/logger';
import { prepareText } from './prepare';
import { chunkPages } from './chunk';
import { chunkVisionPages } from './chunkVision';
import { mapChunk } from './map';
import { mapVisionBatch } from './mapVision';
import { reduceChunks } from './reduce';
import { synthesize } from './synthesize';

// Drives a Job through prepare → chunk → map → reduce → synthesize, exactly
// as far as its persisted `stage` allows. Every stage checks `job.stage`
// before doing its work, and the mapping loop additionally skips any chunk
// index already present in `job.chunkResults` — so calling this again after
// a crash resumes from the last *persisted* point instead of the last
// *attempted* one, and never re-bills a chunk that already succeeded.
// See docs/studysheet-milestones.md M2 and reliability invariants 1, 2, 6.
export async function processJob(jobId: string): Promise<void> {
  const job = await JobModel.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  const log = logger.child({ jobId });

  if (job.status === 'queued') {
    job.status = 'active';
    job.startedAt = job.startedAt ?? new Date();
    await job.save();
  }

  try {
    if (job.stage === 'queued') {
      log.info('stage: preparing');
      const [documentId] = job.documentIds;
      if (!documentId) throw new Error('Job has no documents');
      const doc = await DocumentModel.findById(documentId);
      if (!doc) throw new Error(`Document ${documentId} not found`);

      const buffer = await downloadObject(doc.r2Key);
      const textPages = doc.detectedPerPage.filter((p) => p.path === 'text').map((p) => p.page);
      job.preparedPages = await prepareText(buffer, doc.filename, textPages);
      job.visionPages = doc.detectedPerPage
        .filter((p) => p.path === 'vision' && p.rasterKey && p.rasterSizeBytes !== null)
        .map((p) => ({ page: p.page, rasterKey: p.rasterKey as string, sizeBytes: p.rasterSizeBytes as number }));
      job.stage = 'chunking';
      await job.save();
    }

    if (job.stage === 'chunking') {
      log.info('stage: chunking');
      job.chunks = chunkPages(job.preparedPages);

      const rasterKeyByPage = new Map(job.visionPages.map((p) => [p.page, p.rasterKey]));
      const visionBatches = chunkVisionPages(
        job.visionPages.map((p) => ({ page: p.page, sizeBytes: p.sizeBytes })),
      );
      job.visionChunks = visionBatches.map((batch, i) => ({
        index: job.chunks.length + i,
        pages: batch.pages,
        rasterKeys: batch.pages.map((p) => rasterKeyByPage.get(p) ?? ''),
      }));

      job.stage = 'mapping';
      await job.save();
    }

    if (job.stage === 'mapping') {
      const alreadyDone = new Set(job.chunkResults.map((r) => r.chunkIndex));

      for (const chunk of job.chunks) {
        if (alreadyDone.has(chunk.index)) {
          log.info({ chunkIndex: chunk.index }, 'stage: mapping — text chunk already done, skipping');
          continue;
        }
        log.info({ chunkIndex: chunk.index, of: job.chunks.length }, 'stage: mapping text chunk');
        const result = await mapChunk(chunk);
        job.chunkResults.push({
          chunkIndex: chunk.index,
          result: result.data,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costCents: result.costCents,
        });
        job.tokensUsed.input += result.usage.inputTokens;
        job.tokensUsed.output += result.usage.outputTokens;
        job.costCents += result.costCents;
        // Persisted after every single chunk — a crash mid-loop loses at
        // most the one in-flight call, never a completed one.
        await job.save();
      }

      for (const visionChunk of job.visionChunks) {
        if (alreadyDone.has(visionChunk.index)) {
          log.info({ chunkIndex: visionChunk.index }, 'stage: mapping — vision batch already done, skipping');
          continue;
        }
        log.info(
          { chunkIndex: visionChunk.index, pages: visionChunk.pages.length },
          'stage: mapping vision batch',
        );
        const images = await Promise.all(
          visionChunk.pages.map(async (page, i) => ({
            page,
            jpegBuffer: await downloadObject(visionChunk.rasterKeys[i] as string),
          })),
        );
        const result = await mapVisionBatch(images);
        job.chunkResults.push({
          chunkIndex: visionChunk.index,
          result: result.data,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costCents: result.costCents,
        });
        job.tokensUsed.input += result.usage.inputTokens;
        job.tokensUsed.output += result.usage.outputTokens;
        job.costCents += result.costCents;
        await job.save();
      }

      job.stage = 'reducing';
      await job.save();
    }

    if (job.stage === 'reducing') {
      log.info('stage: reducing');
      job.reduced = reduceChunks(job.chunkResults.map((r) => r.result));
      job.stage = 'synthesizing';
      await job.save();
    }

    if (job.stage === 'synthesizing') {
      log.info('stage: synthesizing');
      const reduced = job.reduced ?? reduceChunks(job.chunkResults.map((r) => r.result));
      const result = await synthesize(reduced, job.config.depth);
      job.tokensUsed.input += result.usage.inputTokens;
      job.tokensUsed.output += result.usage.outputTokens;
      job.costCents += result.costCents;

      const summary = await SummaryModel.create({
        jobId: job.id,
        userId: job.userId,
        sections: result.data.sections,
        definitions: result.data.definitions,
        examQuestions: result.data.examQuestions,
        connections: [],
        version: 1,
      });

      job.summaryId = summary.id;
      job.stage = 'done';
      job.status = 'completed';
      job.finishedAt = new Date();
      await job.save();
    }
  } catch (err) {
    job.status = 'failed';
    job.error = (err as Error).message;
    await job.save();
    throw err;
  }
}
