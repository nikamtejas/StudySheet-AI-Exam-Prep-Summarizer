import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getMongoConnection } from '../src/lib/mongo';
import { uploadObject, checkStorage } from '../src/lib/storage';
import { DocumentModel } from '../src/models/Document';
import { ingestDocument } from '../src/pipeline/ingest';

// Needs real Mongo + S3-compatible storage (docker-compose.yml). This
// sandbox/dev machine may not have Docker running, so these tests check
// reachability first and skip with a clear message rather than failing the
// whole suite — they run for real in CI, which brings up service containers.
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'pdfs');
const load = (name: string) => fs.readFileSync(path.join(FIXTURES_DIR, name));

let infraAvailable = false;

beforeAll(async () => {
  try {
    await getMongoConnection();
    const storage = await checkStorage();
    infraAvailable = storage.ok;
  } catch {
    infraAvailable = false;
  }
  if (!infraAvailable) {
    console.warn(
      '[ingest.test.ts] Mongo/storage not reachable — skipping integration assertions. ' +
        'Run `docker compose up` to exercise these for real.',
    );
  }
}, 10000);

afterAll(async () => {
  if (infraAvailable) {
    await DocumentModel.deleteMany({ userId: { $regex: /^test-/ } });
  }
});

describe('ingestDocument', () => {
  it('ingests a typed PDF, probes it, and persists a Document', async () => {
    if (!infraAvailable) return;

    const userId = `test-${randomUUID()}`;
    const r2Key = `test-uploads/${randomUUID()}/typed.pdf`;
    await uploadObject(r2Key, load('typed.pdf'), 'application/pdf');

    const result = await ingestDocument({ userId, filename: 'typed.pdf', r2Key, sourceType: 'typed' });

    expect(result.dedup).toBe(false);
    expect(result.document.pageCount).toBe(5);
    expect(result.document.textPageCount).toBe(5);
    expect(result.document.visionPageCount).toBe(0);
    expect(result.document.overrideNotice).toBeNull();
  });

  it('rasterizes and stores vision pages, and flags the override notice when "typed" was claimed but pages needed vision', async () => {
    if (!infraAvailable) return;

    const userId = `test-${randomUUID()}`;
    const r2Key = `test-uploads/${randomUUID()}/mixed.pdf`;
    await uploadObject(r2Key, load('mixed.pdf'), 'application/pdf');

    const result = await ingestDocument({ userId, filename: 'mixed.pdf', r2Key, sourceType: 'typed' });

    expect(result.document.visionPageCount).toBe(2);
    expect(result.document.overrideNotice).toMatch(/2 of 5 pages had no readable text layer/);
    const visionPages = result.document.detectedPerPage.filter((p) => p.path === 'vision');
    for (const page of visionPages) {
      expect(page.rasterKey).toBeTruthy();
    }
  });

  it('does no new work and creates no new document when the same file is ingested twice', async () => {
    if (!infraAvailable) return;

    const userId = `test-${randomUUID()}`;
    const r2Key = `test-uploads/${randomUUID()}/typed.pdf`;
    await uploadObject(r2Key, load('typed.pdf'), 'application/pdf');

    const first = await ingestDocument({ userId, filename: 'typed.pdf', r2Key, sourceType: 'typed' });
    expect(first.dedup).toBe(false);

    const countAfterFirst = await DocumentModel.countDocuments({ userId });
    expect(countAfterFirst).toBe(1);

    // Re-upload the identical bytes under a new provisional key (as a real
    // second upload attempt would) and register it again.
    const r2KeySecond = `test-uploads/${randomUUID()}/typed.pdf`;
    await uploadObject(r2KeySecond, load('typed.pdf'), 'application/pdf');
    const second = await ingestDocument({
      userId,
      filename: 'typed.pdf',
      r2Key: r2KeySecond,
      sourceType: 'typed',
    });

    expect(second.dedup).toBe(true);
    expect(second.document.id).toBe(first.document.id);

    const countAfterSecond = await DocumentModel.countDocuments({ userId });
    expect(countAfterSecond).toBe(1);
  });
});
