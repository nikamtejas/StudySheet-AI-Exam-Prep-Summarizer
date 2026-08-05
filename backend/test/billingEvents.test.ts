import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getMongoConnection } from '../src/lib/mongo';
import { SubscriptionModel } from '../src/models/Subscription';
import { UserModel } from '../src/models/User';
import { activateSubscription, markPastDue, cancelSubscription, pauseSubscription } from '../src/pipeline/billingEvents';
import { resolveBilling } from '../src/lib/quota';

let infraAvailable = false;

beforeAll(async () => {
  try {
    await getMongoConnection();
    infraAvailable = true;
  } catch {
    infraAvailable = false;
  }
  if (!infraAvailable) {
    console.warn('[billingEvents.test.ts] Mongo not reachable — skipping. Run `docker compose up` to exercise these for real.');
  }
}, 10000);

const TEST_PREFIX = 'test-billing-events-';

afterAll(async () => {
  if (infraAvailable) {
    await SubscriptionModel.deleteMany({ userId: { $regex: new RegExp(`^${TEST_PREFIX}`) } });
    await UserModel.deleteMany({ email: { $regex: new RegExp(`^${TEST_PREFIX}`) } });
  }
});

async function makeUser(): Promise<string> {
  const user = await UserModel.create({ email: `${TEST_PREFIX}${randomUUID()}@example.com`, plan: 'free' });
  return user.id;
}

describe('activateSubscription', () => {
  it('upgrades User.plan and creates a Subscription record', async () => {
    if (!infraAvailable) return;
    const userId = await makeUser();
    const providerSubId = `sub_${randomUUID()}`;
    const periodStart = new Date();
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await activateSubscription({
      userId,
      provider: 'stripe',
      providerCustomerId: 'cus_test',
      providerSubId,
      tier: 'student',
      pageAllowance: 500,
      periodStart,
      periodEnd,
    });

    const user = await UserModel.findById(userId);
    expect(user?.plan).toBe('student');

    const sub = await SubscriptionModel.findOne({ providerSubId });
    expect(sub?.status).toBe('active');
    expect(sub?.pageAllowance).toBe(500);
  });

  it('upserting the same {provider, providerSubId} twice never creates a second Subscription document — replaying a webhook changes nothing', async () => {
    if (!infraAvailable) return;
    const userId = await makeUser();
    const providerSubId = `sub_${randomUUID()}`;
    const params = {
      userId,
      provider: 'stripe' as const,
      providerCustomerId: 'cus_test',
      providerSubId,
      tier: 'pro' as const,
      pageAllowance: 1500,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };

    await activateSubscription(params);
    await activateSubscription(params);
    await activateSubscription(params);

    const subs = await SubscriptionModel.find({ providerSubId });
    expect(subs).toHaveLength(1);
  });
});

describe('cancelSubscription + resolveBilling degrade-at-period-end', () => {
  it('keeps the paid allowance until periodEnd, even after cancellation', async () => {
    if (!infraAvailable) return;
    const userId = await makeUser();
    const providerSubId = `sub_${randomUUID()}`;

    await activateSubscription({
      userId,
      provider: 'stripe',
      providerCustomerId: 'cus_test',
      providerSubId,
      tier: 'student',
      pageAllowance: 500,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // still in the future
    });
    await cancelSubscription('stripe', providerSubId);

    const billing = await resolveBilling(userId, 'student');
    expect(billing.allowance).toBe(500);

    // docs/studysheet-milestones.md M10: "keeping their library" — this
    // canceled-but-not-yet-lapsed user's account record is untouched aside
    // from the subscription status itself.
    const user = await UserModel.findById(userId);
    expect(user?.plan).toBe('student');
  });

  it('degrades to the free allowance once periodEnd has actually passed, and lazily corrects User.plan', async () => {
    if (!infraAvailable) return;
    const userId = await makeUser();
    const providerSubId = `sub_${randomUUID()}`;

    await activateSubscription({
      userId,
      provider: 'stripe',
      providerCustomerId: 'cus_test',
      providerSubId,
      tier: 'student',
      pageAllowance: 500,
      periodStart: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(Date.now() - 1000), // already in the past
    });
    await cancelSubscription('stripe', providerSubId);

    const billing = await resolveBilling(userId, 'student');
    expect(billing.allowance).toBe(30); // FREE_TIER_PAGES default
    expect(billing.period).toBe('lifetime');
    expect(billing.subscription).toBeNull();

    const user = await UserModel.findById(userId);
    expect(user?.plan).toBe('free');
  });
});

describe('markPastDue / pauseSubscription', () => {
  it('marks a subscription past_due without touching its allowance until it actually lapses', async () => {
    if (!infraAvailable) return;
    const userId = await makeUser();
    const providerSubId = `sub_${randomUUID()}`;
    await activateSubscription({
      userId,
      provider: 'stripe',
      providerCustomerId: 'cus_test',
      providerSubId,
      tier: 'pro',
      pageAllowance: 1500,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    await markPastDue('stripe', providerSubId);

    const sub = await SubscriptionModel.findOne({ providerSubId });
    expect(sub?.status).toBe('past_due');
    const billing = await resolveBilling(userId, 'pro');
    expect(billing.allowance).toBe(1500);
  });

  it('pausing sets status and pausedUntil without deleting the subscription', async () => {
    if (!infraAvailable) return;
    const userId = await makeUser();
    const providerSubId = `sub_${randomUUID()}`;
    await activateSubscription({
      userId,
      provider: 'stripe',
      providerCustomerId: 'cus_test',
      providerSubId,
      tier: 'student',
      pageAllowance: 500,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    const resumesAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    await pauseSubscription('stripe', providerSubId, resumesAt);

    const sub = await SubscriptionModel.findOne({ providerSubId });
    expect(sub?.status).toBe('paused');
    expect(sub?.pausedUntil?.getTime()).toBe(resumesAt.getTime());
  });
});
