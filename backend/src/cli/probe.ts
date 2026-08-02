import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateFileBasics } from '../pipeline/validate';
import { probeDocument } from '../pipeline/probe';

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npm run probe -- <path-to-pdf>');
    process.exitCode = 1;
    return;
  }

  const buffer = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const start = Date.now();

  try {
    validateFileBasics(buffer, filename);
    const hash = createHash('sha256').update(buffer).digest('hex');
    const result = await probeDocument(buffer, filename);
    const elapsedMs = Date.now() - start;

    console.log(
      `\n${filename}  (${(buffer.byteLength / 1024).toFixed(1)} KB, sha256 ${hash.slice(0, 12)}…)`,
    );
    console.log(
      `${result.pageCount} pages — ${result.textPageCount} text, ${result.visionPageCount} vision\n`,
    );
    console.log('page  path    chars  rot  lang');
    for (const p of result.detectedPerPage) {
      console.log(
        `${String(p.page).padStart(4)}  ${p.path.padEnd(6)}  ${String(p.charCount).padStart(5)}  ${String(p.rotation).padStart(3)}  ${p.lang ?? '-'}`,
      );
    }
    const rssMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
    console.log(`\nprobed in ${elapsedMs}ms, RSS ${rssMb}MB`);
  } catch (err) {
    console.error(`\n${(err as Error).name}: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

main();
