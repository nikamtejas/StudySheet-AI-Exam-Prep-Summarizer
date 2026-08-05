import { Router } from 'express';
import { UsageModel } from '../../models/Usage';
import { resolveBilling } from '../../lib/quota';
import { asyncHandler } from '../asyncHandler';
import type { BillingUsageResponse } from '../../contracts';

export const usageRouter = Router();

// docs/studysheet-build-prompt.md §10: "GET /api/usage → pages used /
// remaining this period" — §12: "Show a page balance in the header." M10
// extends this with subscription status and renewal date
// (docs/studysheet-milestones.md M10: "Usage dashboard: pages used, pages
// left, renewal date"). Allowance/period both come from resolveBilling
// (lib/quota.ts) — the same function job creation's quota check uses — so
// this can never show a different number than what's actually enforced.
usageRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId, plan } = req.identity;
    const { allowance, period, subscription } = await resolveBilling(userId, plan);

    const usage = await UsageModel.findOne({ userId, period });
    const pagesUsed = usage?.pagesUsed ?? 0;
    const pagesReserved = usage?.pagesReserved ?? 0;

    const body: BillingUsageResponse = {
      plan: subscription ? subscription.tier : 'free',
      period,
      pagesAllowance: allowance,
      pagesUsed,
      pagesReserved,
      pagesRemaining: allowance - pagesUsed - pagesReserved,
      subscriptionStatus: subscription?.status ?? null,
      renewalDate: subscription?.periodEnd.toISOString() ?? null,
      pausedUntil: subscription?.pausedUntil?.toISOString() ?? null,
    };
    res.json(body);
  }),
);
