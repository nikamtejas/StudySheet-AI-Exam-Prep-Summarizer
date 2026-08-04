import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID, createHmac } from 'node:crypto';
import { getMongoConnection } from '../src/lib/mongo';
import { RenderTokenModel } from '../src/models/RenderToken';
import { env } from '../src/config/env';
import {
  createRenderToken,
  verifyRenderTokenSignature,
  verifyAndConsumeRenderToken,
} from '../src/lib/renderToken';

// Duplicates lib/renderToken.ts's own signing scheme to hand-construct a
// token with an already-past exp claim — createRenderToken() itself always
// signs for "now + TTL", so there's no other way to get a genuinely expired
// (but correctly-signed) token string to test the exp-claim check with.
function signExpiredToken(summaryId: string, secondsAgo: number): string {
  const jti = randomUUID();
  const exp = Math.floor(Date.now() / 1000) - secondsAgo;
  const payload = `${jti}.${summaryId}.${exp}`;
  const signature = createHmac('sha256', env.RENDER_TOKEN_SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

// Needs real Mongo — same skip-gracefully pattern as test/ingest.test.ts.
let infraAvailable = false;

beforeAll(async () => {
  try {
    await getMongoConnection();
    infraAvailable = true;
  } catch {
    infraAvailable = false;
  }
  if (!infraAvailable) {
    console.warn(
      '[renderToken.test.ts] Mongo not reachable — skipping. Run `docker compose up` to exercise these for real.',
    );
  }
}, 10000);

const TEST_PREFIX = 'test-render-token-';

afterAll(async () => {
  if (infraAvailable) {
    await RenderTokenModel.deleteMany({ summaryId: { $regex: new RegExp(`^${TEST_PREFIX}`) } });
  }
});

describe('render tokens', () => {
  it('verifies and consumes a freshly created token exactly once', async () => {
    if (!infraAvailable) return;
    const summaryId = `${TEST_PREFIX}${randomUUID()}`;
    const { token } = await createRenderToken(summaryId);

    expect(verifyRenderTokenSignature(token, summaryId)).toBe(true);
    expect(await verifyAndConsumeRenderToken(token, summaryId)).toBe(true);
    // Single-use: the same token fails the second time.
    expect(await verifyAndConsumeRenderToken(token, summaryId)).toBe(false);
  });

  it('rejects a token scoped to a different summaryId', async () => {
    if (!infraAvailable) return;
    const summaryId = `${TEST_PREFIX}${randomUUID()}`;
    const { token } = await createRenderToken(summaryId);

    expect(verifyRenderTokenSignature(token, `${TEST_PREFIX}${randomUUID()}`)).toBe(false);
    expect(await verifyAndConsumeRenderToken(token, `${TEST_PREFIX}${randomUUID()}`)).toBe(false);
  });

  it('rejects a forged token (tampered signature)', async () => {
    if (!infraAvailable) return;
    const summaryId = `${TEST_PREFIX}${randomUUID()}`;
    const { token } = await createRenderToken(summaryId);
    const forged = `${token.slice(0, -4)}0000`;

    expect(verifyRenderTokenSignature(forged, summaryId)).toBe(false);
    expect(await verifyAndConsumeRenderToken(forged, summaryId)).toBe(false);
  });

  it('rejects a completely made-up token', async () => {
    if (!infraAvailable) return;
    const summaryId = `${TEST_PREFIX}${randomUUID()}`;
    expect(verifyRenderTokenSignature('not.a.real.token', summaryId)).toBe(false);
    expect(await verifyAndConsumeRenderToken('not.a.real.token', summaryId)).toBe(false);
  });

  it('rejects a token whose embedded exp claim is already in the past (stateless check)', () => {
    const summaryId = `${TEST_PREFIX}${randomUUID()}`;
    const expired = signExpiredToken(summaryId, 10);
    expect(verifyRenderTokenSignature(expired, summaryId)).toBe(false);
  });

  it('rejects an expired token at the DB layer even if a persisted row exists', async () => {
    if (!infraAvailable) return;
    const summaryId = `${TEST_PREFIX}${randomUUID()}`;
    const { token, jti } = await createRenderToken(summaryId);

    // Backdate the persisted record — mirrors what actually waiting past the
    // TTL would produce, without a real 2-minute sleep.
    await RenderTokenModel.updateOne({ jti }, { expiresAt: new Date(Date.now() - 1000) });

    expect(await verifyAndConsumeRenderToken(token, summaryId)).toBe(false);
  });
});
