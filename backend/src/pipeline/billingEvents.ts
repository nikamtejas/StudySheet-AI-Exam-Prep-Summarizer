import { SubscriptionModel } from '../models/Subscription';
import { UserModel } from '../models/User';
import type { PlanTier } from '../contracts';

// The entitlement state machine both providers' webhook handlers
// (api/routes/webhooks.ts) drive — one place a Subscription/User.plan ever
// changes, regardless of which provider's event triggered it, so Stripe and
// Razorpay can't drift into handling the "same" transition differently.
// docs/studysheet-milestones.md M10: "webhooks are the only source of
// entitlement" — nothing outside this file and its callers ever writes to
// Subscription.status or User.plan.

export interface ActivateParams {
  userId: string;
  provider: 'stripe' | 'razorpay';
  providerCustomerId: string;
  providerSubId: string;
  tier: PlanTier;
  pageAllowance: number;
  periodStart: Date;
  periodEnd: Date;
}

// Checkout completed, or a subscription's period rolled over — upsert by
// {provider, providerSubId} (Subscription's own unique index) so a
// duplicate delivery of the same "activate" event is naturally idempotent
// at the database level too, on top of the WebhookEvent dedup layer in
// api/routes/webhooks.ts.
export async function activateSubscription(params: ActivateParams): Promise<void> {
  const { userId, provider, providerCustomerId, providerSubId, tier, pageAllowance, periodStart, periodEnd } = params;

  await SubscriptionModel.findOneAndUpdate(
    { provider, providerSubId },
    {
      userId,
      provider,
      providerCustomerId,
      providerSubId,
      tier,
      status: 'active',
      pageAllowance,
      periodStart,
      periodEnd,
      pausedUntil: null,
    },
    { upsert: true },
  );

  await UserModel.findByIdAndUpdate(userId, { plan: tier });
}

export async function markPastDue(provider: 'stripe' | 'razorpay', providerSubId: string): Promise<void> {
  await SubscriptionModel.updateOne({ provider, providerSubId }, { status: 'past_due' });
}

// docs/studysheet-build-prompt.md §12: "Offer pause, not cancel."
export async function pauseSubscription(
  provider: 'stripe' | 'razorpay',
  providerSubId: string,
  pausedUntil: Date | null,
): Promise<void> {
  await SubscriptionModel.updateOne({ provider, providerSubId }, { status: 'paused', pausedUntil });
}

export async function resumeSubscription(provider: 'stripe' | 'razorpay', providerSubId: string): Promise<void> {
  await SubscriptionModel.updateOne({ provider, providerSubId }, { status: 'active', pausedUntil: null });
}

// A period rollover (successful renewal) or a resume-from-pause on an
// *existing* Subscription document — refreshes dates/status without
// needing to already know the tier/allowance again (unlike
// activateSubscription, which creates the record in the first place).
export async function refreshSubscriptionPeriod(
  provider: 'stripe' | 'razorpay',
  providerSubId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<void> {
  await SubscriptionModel.updateOne(
    { provider, providerSubId },
    { status: 'active', periodStart, periodEnd, pausedUntil: null },
  );
}

// docs/studysheet-milestones.md M10: "A user whose payment fails degrades
// to free at period end, keeping their library." Deliberately does NOT
// touch User.plan here — the subscription's periodEnd is the moment that
// degrade should actually take effect, not the moment cancellation is
// requested/confirmed (a canceled subscription still owes the user the
// period they already paid for). lib/quota.ts's resolveBilling is where the
// periodEnd check actually happens and where User.plan gets lazily
// corrected once it's genuinely lapsed — see its own comment. Nothing here
// or anywhere else deletes a Summary/Document/Deck on cancellation; "keeping
// their library" falls out naturally from never having written that logic,
// not from a special case.
export async function cancelSubscription(provider: 'stripe' | 'razorpay', providerSubId: string): Promise<void> {
  await SubscriptionModel.updateOne({ provider, providerSubId }, { status: 'canceled' });
}
