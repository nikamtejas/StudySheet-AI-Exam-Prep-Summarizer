import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getMongoConnection } from '../lib/mongo';
import { validateFileBasics } from '../pipeline/validate';
import { probeDocument } from '../pipeline/probe';
import { prepareText } from '../pipeline/prepare';
import { chunkPages } from '../pipeline/chunk';
import { rasterizePages } from '../pipeline/rasterize';
import { uploadObject } from '../lib/storage';
import { processJob } from '../pipeline/orchestrate';
import { JobModel, type VisionPageRecord } from '../models/Job';
import { SummaryModel } from '../models/Summary';
import type { Depth } from '../contracts';

const VALID_DEPTHS: Depth[] = ['crash', 'balanced', 'deep'];

function parseArgs(argv: string[]): { filePath: string; depth: Depth } {
  const filePath = argv[0];
  if (!filePath) {
    throw new Error('Usage: npm run summarize -- <path-to-pdf> [--depth crash|balanced|deep]');
  }
  const depthIndex = argv.indexOf('--depth');
  const depthArg = depthIndex >= 0 ? argv[depthIndex + 1] : undefined;
  const depth = VALID_DEPTHS.includes(depthArg as Depth) ? (depthArg as Depth) : 'balanced';
  return { filePath, depth };
}

// CLI, per docs/studysheet-milestones.md M2/M3: runs the full pipeline
// (text and/or vision path) against a local file and prints cost — no HTTP
// API, no BullMQ. It still goes through the same Job model + processJob() as
// the real worker (so it exercises the identical resumable code path), but
// skips the Document/storage round trip for the source PDF itself since the
// file is already on disk: the Job is created directly at stage "chunking"
// with preparedPages already filled in. Vision-path pages are the exception —
// the orchestrator's mapping stage universally resolves vision buffers via
// downloadObject(rasterKey), so a document with vision pages still needs
// local pages rasterized and uploaded to real storage (MinIO/R2) to get a
// rasterKey, even though the source PDF never round-trips through Document.
async function main(): Promise<void> {
  const { filePath, depth } = parseArgs(process.argv.slice(2));
  const filename = path.basename(filePath);
  const buffer = fs.readFileSync(filePath);

  console.log(`Summarizing ${filename} (depth: ${depth})...`);
  const start = Date.now();

  validateFileBasics(buffer, filename);
  const probeResult = await probeDocument(buffer, filename);
  const textPages = probeResult.detectedPerPage.filter((p) => p.path === 'text').map((p) => p.page);
  const visionPageNumbers = probeResult.detectedPerPage
    .filter((p) => p.path === 'vision')
    .map((p) => p.page);

  if (textPages.length === 0 && visionPageNumbers.length === 0) {
    throw new Error(`"${filename}" has no readable pages.`);
  }

  const preparedPages = await prepareText(buffer, filename, textPages);
  const chunks = chunkPages(preparedPages);
  const fileHash = createHash('sha256').update(buffer).digest('hex');

  let visionPages: VisionPageRecord[] = [];
  if (visionPageNumbers.length > 0) {
    console.log(`Rasterizing ${visionPageNumbers.length} vision-path page(s)...`);
    const rasterized = await rasterizePages(buffer, visionPageNumbers);
    try {
      visionPages = await Promise.all(
        rasterized.map(async ({ page, jpegBuffer }) => {
          const rasterKey = `cli-local/${fileHash}/pages/${page}.jpg`;
          await uploadObject(rasterKey, jpegBuffer, 'image/jpeg');
          return { page, rasterKey, sizeBytes: jpegBuffer.byteLength };
        }),
      );
    } catch (err) {
      throw new Error(
        `"${filename}" has vision-path pages, which require object storage (MinIO/R2) to be reachable — ` +
          `is it running? (${(err as Error).message})`,
      );
    }
  }

  await getMongoConnection();
  const job = await JobModel.create({
    userId: 'cli',
    documentIds: [`local:${fileHash}`],
    status: 'queued',
    stage: 'chunking',
    config: { depth },
    preparedPages,
    chunks,
    visionPages,
    chunkResults: [],
    tokensUsed: { input: 0, output: 0 },
    costCents: 0,
  });

  await processJob(job.id);

  const finished = await JobModel.findById(job.id);
  if (!finished || finished.status !== 'completed') {
    throw new Error(`Job did not complete: ${finished?.error ?? 'unknown error'}`);
  }

  const summary = await SummaryModel.findById(finished.summaryId);
  const elapsedMs = Date.now() - start;

  const outPath = `${filePath.replace(/\.pdf$/i, '')}.summary.json`;
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));

  console.log(`\nWrote ${outPath}`);
  console.log(
    `Pages: ${probeResult.pageCount} total (${textPages.length} text, ${probeResult.visionPageCount} vision)`,
  );
  console.log(`Chunks: ${chunks.length} text, ${finished.visionChunks.length} vision`);
  if (finished.problems.length > 0) {
    const verifiedCount = finished.problemResults.filter((r) => r.result.verified).length;
    console.log(`Problems: ${finished.problemResults.length} solved (${verifiedCount} verified)`);
  }
  console.log(`Tokens: ${finished.tokensUsed.input} in / ${finished.tokensUsed.output} out`);
  console.log(`Cost: $${(finished.costCents / 100).toFixed(4)}`);
  console.log(`Time: ${(elapsedMs / 1000).toFixed(1)}s`);

  process.exit(0);
}

main().catch((err) => {
  console.error(`\n${(err as Error).name}: ${(err as Error).message}`);
  // The open Mongo connection keeps the event loop alive otherwise — this
  // CLI is a one-shot script, not a long-lived server.
  process.exit(1);
});
