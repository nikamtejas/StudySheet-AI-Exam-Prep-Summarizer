import mongoose from 'mongoose';
import { UsageModel } from '../models/Usage';
import { UserModel } from '../models/User';
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
  const period = periodFor(plan);
  const allowance = PLAN_ALLOWANCES[plan];

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
  const period = periodFor(plan);
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
  const period = periodFor(plan);
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
