import { Router } from 'express';
import { UsageModel } from '../../models/Usage';
import { PLAN_ALLOWANCES, periodFor } from '../../pipeline/quota';
import { asyncHandler } from '../asyncHandler';
import type { UsageResponse } from '../../contracts';

export const usageRouter = Router();

// docs/studysheet-build-prompt.md §10: "GET /api/usage → pages used /
// remaining this period" — §12: "Show a page balance in the header."
usageRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId, plan } = req.identity;
    const period = periodFor(plan);
    const allowance = PLAN_ALLOWANCES[plan];

    const usage = await UsageModel.findOne({ userId, period });
    const pagesUsed = usage?.pagesUsed ?? 0;
    const pagesReserved = usage?.pagesReserved ?? 0;

    const body: UsageResponse = {
      plan,
      period,
      pagesAllowance: allowance,
      pagesUsed,
      pagesReserved,
      pagesRemaining: allowance - pagesUsed - pagesReserved,
    };
    res.json(body);
  }),
);
