// GENERATED FILE — DO NOT EDIT.
// Source of truth: backend/src/contracts/billing.ts
// Regenerate with: npm run sync:contracts (in backend/)

import { z } from 'zod';
import { PlanTierSchema } from './auth';

// docs/studysheet-build-prompt.md §12: "Regional pricing: adjust the page
// allowance, not just the price." Two markets for now — 'global' (USD via
// Stripe) and 'in' (INR via Razorpay, per §12's own worked example: "Drop
// the Student tier to ₹199... and set the cap at ~150 pages"). Pro/Semester
// IN pricing extrapolates that same ~30%-of-global-allowance ratio — not
// spec-mandated exactly (only Student's numbers are given), a documented
// judgment call consistent with the principle §12 states explicitly.
export const MarketSchema = z.enum(['global', 'in']);
export type Market = z.infer<typeof MarketSchema>;

export const BillableTierSchema = z.enum(['student', 'pro', 'semester']);
export type BillableTier = z.infer<typeof BillableTierSchema>;

export const BillingPlanSchema = z.object({
  tier: PlanTierSchema,
  name: z.string(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string(),
  interval: z.enum(['month', 'one_time']),
  pagesAllowance: z.number().int().nonnegative(),
  filesPerJob: z.number().int().positive(),
  priorityQueue: z.boolean(),
});
export type BillingPlan = z.infer<typeof BillingPlanSchema>;

export const BillingPlansResponseSchema = z.object({
  market: MarketSchema,
  plans: z.array(BillingPlanSchema),
});
export type BillingPlansResponse = z.infer<typeof BillingPlansResponseSchema>;

export const ProviderSchema = z.enum(['stripe', 'razorpay']);
export type Provider = z.infer<typeof ProviderSchema>;

export const CheckoutRequestSchema = z.object({
  tier: BillableTierSchema,
  provider: ProviderSchema,
});
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

export const CheckoutResponseSchema = z.object({
  url: z.string(),
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

export const PortalResponseSchema = z.object({
  url: z.string(),
});
export type PortalResponse = z.infer<typeof PortalResponseSchema>;

// docs/studysheet-build-prompt.md §12: "Verify student status (SheerID or
// .edu/.ac.* email)". Only the email-domain check is real here — SheerID
// itself needs a paid account/API key this environment doesn't have (same
// "optional, degrades cleanly, wire in real credentials later" pattern as
// M8's Google OAuth).
export const StudentVerifyRequestSchema = z.object({
  email: z.string().email(),
});
export type StudentVerifyRequest = z.infer<typeof StudentVerifyRequestSchema>;

export const StudentVerifyResponseSchema = z.object({
  verified: z.boolean(),
});
export type StudentVerifyResponse = z.infer<typeof StudentVerifyResponseSchema>;

// GET /api/usage (M8) extended with renewal date and subscription status —
// docs/studysheet-milestones.md M10: "Usage dashboard: pages used, pages
// left, renewal date."
export const BillingUsageResponseSchema = z.object({
  plan: PlanTierSchema,
  period: z.string(),
  pagesAllowance: z.number().int().nonnegative(),
  pagesUsed: z.number().int().nonnegative(),
  pagesReserved: z.number().int().nonnegative(),
  pagesRemaining: z.number().int(),
  subscriptionStatus: z.enum(['active', 'past_due', 'paused', 'canceled']).nullable(),
  renewalDate: z.string().nullable(),
  pausedUntil: z.string().nullable(),
});
export type BillingUsageResponse = z.infer<typeof BillingUsageResponseSchema>;
