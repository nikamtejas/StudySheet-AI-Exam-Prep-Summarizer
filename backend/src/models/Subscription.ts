import { Schema, model, type HydratedDocument } from 'mongoose';
import type { PlanTier } from '../contracts';

// docs/studysheet-build-prompt.md §8. One doc per paid entitlement — a free
// account has no Subscription document at all (User.plan defaults to
// 'free', per M8); this only exists once a checkout completes.
export interface SubscriptionAttrs {
  userId: string;
  provider: 'stripe' | 'razorpay';
  providerCustomerId: string;
  providerSubId: string;
  tier: PlanTier;
  status: 'active' | 'past_due' | 'paused' | 'canceled';
  pageAllowance: number;
  periodStart: Date;
  periodEnd: Date;
  pausedUntil: Date | null;
}

export type SubscriptionInstance = HydratedDocument<SubscriptionAttrs>;

const SubscriptionMongooseSchema = new Schema<SubscriptionAttrs>(
  {
    userId: { type: String, required: true },
    provider: { type: String, enum: ['stripe', 'razorpay'], required: true },
    providerCustomerId: { type: String, required: true },
    providerSubId: { type: String, required: true },
    tier: { type: String, enum: ['free', 'student', 'pro', 'semester'], required: true },
    status: { type: String, enum: ['active', 'past_due', 'paused', 'canceled'], required: true },
    pageAllowance: { type: Number, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    pausedUntil: { type: Date, default: null },
  },
  { timestamps: false },
);

// Webhooks are the only writer (api/routes/webhooks.ts) — every lookup is by
// one of these. Uniqueness is scoped to {provider, providerSubId} rather
// than providerSubId alone — both Stripe and Razorpay generate ids with a
// "sub_" prefix, so a bare providerSubId isn't guaranteed unique *across*
// providers, only within one.
SubscriptionMongooseSchema.index({ userId: 1 });
SubscriptionMongooseSchema.index({ providerCustomerId: 1 });
SubscriptionMongooseSchema.index({ provider: 1, providerSubId: 1 }, { unique: true });

export const SubscriptionModel = model<SubscriptionAttrs>('Subscription', SubscriptionMongooseSchema);
