import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getMongoConnection } from '../src/lib/mongo';
import { UsageModel } from '../src/models/Usage';
import { reserveQuota, releaseQuota, commitQuota, QuotaExceededError } from '../src/lib/quota';
import { PLAN_ALLOWANCES, periodFor } from '../src/pipeline/quota';

// Needs real Mongo — the whole point of this file is proving the race is
// actually closed by MongoDB's atomic findOneAndUpdate, not by mocking it
// away. Skips gracefully when unreachable, same pattern as
// test/orchestrate.test.ts (infraAvailable is only known after the async
// beforeAll below completes, so each `it` checks it directly rather than
// `describe.runIf`, which would evaluate before beforeAll ever runs).
let infraAvailable = false;

beforeAll(async () => {
  try {
    await getMongoConnection();
    infraAvailable = true;
  } catch {
    infraAvailable = false;
  }
  if (!infraAvailable) {
    console.warn('[quota-race.test.ts] Mongo not reachable — skipping. Run `docker compose up` to exercise these for real.');
  }
}, 10000);

// Disjoint from every other real-Mongo test file's userId prefix (see
// [[project-m3-vision-path-decisions]] on why a shared prefix races across
// vitest's parallel worker processes and corrupts another file's cleanup).
const TEST_USER_PREFIX = 'test-quota-race-';

afterAll(async () => {
  if (infraAvailable) {
    await UsageModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_USER_PREFIX}`) } });
  }
});

describe('reserveQuota concurrency', () => {
  it("never lets concurrent reservations exceed the plan's allowance — docs/studysheet-milestones.md M8: 'concurrent job submissions can't exceed the quota'", async () => {
    if (!infraAvailable) return;

    const userId = `${TEST_USER_PREFIX}${randomUUID()}`;
    const allowance = PLAN_ALLOWANCES.free;
    const pagesPerRequest = 5;
    // Enough concurrent requests that their total (10x allowance) massively
    // overshoots if the race isn't actually closed — a lost-update bug would
    // let most or all of these through.
    const requestCount = Math.ceil((allowance / pagesPerRequest) * 10);

    const results = await Promise.allSettled(
      Array.from({ length: requestCount }, () => reserveQuota(userId, 'free', pagesPerRequest)),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected');

    expect(failed.every((r) => (r as PromiseRejectedResult).reason instanceof QuotaExceededError)).toBe(true);
    expect(succeeded * pagesPerRequest).toBeLessThanOrEqual(allowance);

    const usage = await UsageModel.findOne({ userId, period: periodFor('free') });
    // The persisted state must agree exactly with how many calls actually
    // succeeded — this is what rules out a lost update (a race that let the
    // in-memory success count and the database's real total drift apart).
    expect(usage?.pagesReserved).toBe(succeeded * pagesPerRequest);
    expect(usage?.pagesReserved).toBeLessThanOrEqual(allowance);
  });

  it('rejects a single request that alone exceeds a fresh allowance (no prior Usage doc to gate against)', async () => {
    if (!infraAvailable) return;

    const userId = `${TEST_USER_PREFIX}${randomUUID()}`;
    await expect(reserveQuota(userId, 'free', PLAN_ALLOWANCES.free + 1)).rejects.toBeInstanceOf(QuotaExceededError);
  });
});

describe('release and commit', () => {
  it('a failed job returns its reserved pages', async () => {
    if (!infraAvailable) return;

    const userId = `${TEST_USER_PREFIX}${randomUUID()}`;
    await reserveQuota(userId, 'free', 10);

    let usage = await UsageModel.findOne({ userId, period: periodFor('free') });
    expect(usage?.pagesReserved).toBe(10);
    expect(usage?.pagesUsed).toBe(0);

    await releaseQuota(userId, 'free', 10);

    usage = await UsageModel.findOne({ userId, period: periodFor('free') });
    expect(usage?.pagesReserved).toBe(0);
    expect(usage?.pagesUsed).toBe(0);
  });

  it('a completed job moves the reservation into committed usage and records cost', async () => {
    if (!infraAvailable) return;

    const userId = `${TEST_USER_PREFIX}${randomUUID()}`;
    await reserveQuota(userId, 'free', 12);

    await commitQuota(userId, 'free', 12, 4, 56);

    const usage = await UsageModel.findOne({ userId, period: periodFor('free') });
    expect(usage?.pagesReserved).toBe(0);
    expect(usage?.pagesUsed).toBe(12);
    expect(usage?.pagesVision).toBe(4);
    expect(usage?.pagesText).toBe(8);
    expect(usage?.jobCount).toBe(1);
    expect(usage?.costCents).toBe(56);
  });

  it('committed usage from one job leaves room for exactly what remains of the allowance', async () => {
    if (!infraAvailable) return;

    const userId = `${TEST_USER_PREFIX}${randomUUID()}`;
    const allowance = PLAN_ALLOWANCES.free;

    await reserveQuota(userId, 'free', allowance - 5);
    await commitQuota(userId, 'free', allowance - 5, 0, 10);

    await expect(reserveQuota(userId, 'free', 6)).rejects.toBeInstanceOf(QuotaExceededError);
    await expect(reserveQuota(userId, 'free', 5)).resolves.toBeUndefined();
  });
});
