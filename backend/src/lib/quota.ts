import mongoose from 'mongoose';
import { UsageModel } from '../models/Usage';
import { UserModel } from '../models/User';
import { SubscriptionModel, type SubscriptionInstance } from '../models/Subscription';
import { PLAN_ALLOWANCES, periodFor } from '../pipeline/quota';
import { isDuplicateKeyError } from './errors';
import type { PlanTier } from '../contracts';

export class QuotaExceededError extends Error {
  constructor(
    public allowance: number,
    public used: number,
    public reserved: number,
    public requested: number,
  ) {
    super(`quota exceeded: ${used + reserved} + ${requested} > ${allowance}`);
    this.name = 'QuotaExceededError';
  }
}

// Anonymous identities never have a User document to read a plan off of —
// they're always 'free' (api/middleware/identity.ts sets this too; this is
// the worker-side equivalent lookup, since the worker only has a userId
// string, not the original request's req.identity). Any userId that isn't a
// real ObjectId (older test fixtures predating M8's identity model use
// arbitrary string prefixes like 'test-text-orch-...') falls back to 'free'
// the same way rather than throwing a Mongoose CastError — an unresolvable
// userId is conservatively treated as the lowest allowance, never a crash.
export async function resolvePlan(userId: string): Promise<PlanTier> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return 'free';
  const user = await UserModel.findById(userId);
  return user?.plan ?? 'free';
}

export interface BillingInfo {
  allowance: number;
  period: string;
  subscription: SubscriptionInstance | null;
}

// The single place that turns {userId, plan} into "what allowance, what
// period" — every quota operation and the usage dashboard (api/routes/usage.ts)
// go through this so they can never drift apart on what a user's real,
// market-specific entitlement is. Free is a hardcoded global constant (no
// Subscription document exists for a free account); a paid plan's allowance
// and period both come from that user's own Subscription — the market they
// actually signed up under, not a recomputed guess.
//
// This is also where docs/studysheet-milestones.md M10's "degrades to free
// at period end" actually gets enforced: pipeline/billingEvents.ts's
// cancelSubscription() deliberately never touches User.plan (a canceled
// subscription still owes the user the period they already paid for), so
// the only place that matters — whether this reservation/read should be
// billed at the paid allowance or the free one — has to check the real
// periodEnd itself, not just the cached tier string. Once a canceled
// subscription's periodEnd has passed, User.plan gets lazily corrected here
// too, so this doesn't need a scheduled job to eventually reflect reality.
export async function resolveBilling(userId: string, plan: PlanTier): Promise<BillingInfo> {
  if (plan === 'free') {
    return { allowance: PLAN_ALLOWANCES.free, period: periodFor(plan), subscription: null };
  }

  const subscription = await SubscriptionModel.findOne({ userId }).sort({ periodEnd: -1 });
  const lapsed = !subscription || (subscription.status === 'canceled' && new Date() > subscription.periodEnd);

  if (lapsed) {
    if (subscription) {
      await UserModel.findByIdAndUpdate(userId, { plan: 'free' });
    }
    return { allowance: PLAN_ALLOWANCES.free, period: periodFor('free'), subscription: null };
  }

  return {
    allowance: subscription.pageAllowance,
    period: periodFor(plan, subscription.periodStart),
    subscription,
  };
}

async function ensureUsageDoc(userId: string, period: string): Promise<void> {
  try {
    await UsageModel.create({ userId, period });
  } catch (err) {
    // Two concurrent first-ever reservations for the same user+period both
    // try to create this doc — the unique index (models/Usage.ts) is what
    // actually prevents the duplicate; whichever call loses the race just
    // means the other one already created it, which is exactly what we want.
    if (!isDuplicateKeyError(err)) throw err;
  }
}

// Reserve-before-queue (docs/studysheet-milestones.md M8). Race-safe under
// concurrent submissions: the conditional $expr filter and the $inc happen
// as one atomic findOneAndUpdate, evaluated against a locked document — two
// requests racing to reserve the last few pages of an allowance can't both
// match once the first one's $inc has applied, so the second genuinely fails
// with QuotaExceededError instead of silently over-allocating. This is why
// ensureUsageDoc must complete as its own separate step first: an upsert
// combined with an $expr filter would insert unconditionally on a
// not-yet-existing document (there's nothing for $expr to evaluate against),
// which would let a single first-ever request skip the check entirely
// regardless of how many pages it asked for.
export async function reserveQuota(userId: string, plan: PlanTier, pages: number): Promise<void> {
  const { allowance, period } = await resolveBilling(userId, plan);

  await ensureUsageDoc(userId, period);

  const updated = await UsageModel.findOneAndUpdate(
    {
      userId,
      period,
      $expr: { $lte: [{ $add: ['$pagesUsed', '$pagesReserved', pages] }, allowance] },
    },
    { $inc: { pagesReserved: pages } },
    { new: true },
  );

  if (!updated) {
    const current = await UsageModel.findOne({ userId, period });
    throw new QuotaExceededError(allowance, current?.pagesUsed ?? 0, current?.pagesReserved ?? 0, pages);
  }
}

// Called from the worker when a job fails (pipeline/orchestrate.ts) — gives
// back exactly what was reserved for that job (Job.reservedPages), never a
// freshly recomputed page count, in case the underlying Document could ever
// change between reservation and release.
export async function releaseQuota(userId: string, plan: PlanTier, pages: number): Promise<void> {
  if (pages <= 0) return;
  const { period } = await resolveBilling(userId, plan);
  await UsageModel.updateOne({ userId, period }, { $inc: { pagesReserved: -pages } });
}

// Called from the worker when a job completes — moves the reservation into
// committed usage and records the real measured cost (reliability invariant
// 8: "every job records costCents and tokensUsed").
export async function commitQuota(
  userId: string,
  plan: PlanTier,
  pages: number,
  visionPages: number,
  costCents: number,
): Promise<void> {
  const { period } = await resolveBilling(userId, plan);
  await UsageModel.updateOne(
    { userId, period },
    {
      $inc: {
        pagesReserved: -pages,
        pagesUsed: pages,
        pagesVision: visionPages,
        pagesText: pages - visionPages,
        jobCount: 1,
        costCents,
      },
    },
  );
}
