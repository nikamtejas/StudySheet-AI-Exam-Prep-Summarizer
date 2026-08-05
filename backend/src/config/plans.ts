import type { BillingPlan, Market } from '../contracts';

// docs/studysheet-build-prompt.md §12's tiers table (global/USD) and its
// worked regional-pricing example (India/INR): "Dropping the Student tier
// to ₹199 with the same 500 pages is a loss-making plan. Drop the price and
// set the cap at ~150 pages, and it holds margin." Pro/Semester's IN numbers
// extrapolate that same ~30%-of-global-allowance ratio — not spec-mandated
// exactly (only Student's numbers are given), a documented judgment call
// consistent with the principle §12 states explicitly: "recompute these
// before you launch."
//
// priceCents is in the market's smallest currency unit (cents for USD,
// paise for INR — both happen to be 1/100 of the major unit here).
const PLANS: Record<Market, BillingPlan[]> = {
  global: [
    {
      tier: 'free',
      name: 'Free',
      priceCents: 0,
      currency: 'usd',
      interval: 'month',
      pagesAllowance: 30,
      filesPerJob: 2,
      priorityQueue: false,
    },
    {
      tier: 'student',
      name: 'Student',
      priceCents: 799,
      currency: 'usd',
      interval: 'month',
      pagesAllowance: 500,
      filesPerJob: 10,
      priorityQueue: false,
    },
    {
      tier: 'pro',
      name: 'Pro',
      priceCents: 1699,
      currency: 'usd',
      interval: 'month',
      pagesAllowance: 1500,
      filesPerJob: 25,
      priorityQueue: true,
    },
    {
      tier: 'semester',
      name: 'Semester pass',
      priceCents: 2900,
      currency: 'usd',
      interval: 'one_time',
      pagesAllowance: 2000,
      filesPerJob: 10,
      priorityQueue: false,
    },
  ],
  in: [
    {
      tier: 'free',
      name: 'Free',
      priceCents: 0,
      currency: 'inr',
      interval: 'month',
      pagesAllowance: 30,
      filesPerJob: 2,
      priorityQueue: false,
    },
    {
      tier: 'student',
      name: 'Student',
      priceCents: 19900,
      currency: 'inr',
      interval: 'month',
      pagesAllowance: 150,
      filesPerJob: 10,
      priorityQueue: false,
    },
    {
      tier: 'pro',
      name: 'Pro',
      priceCents: 39900,
      currency: 'inr',
      interval: 'month',
      pagesAllowance: 450,
      filesPerJob: 25,
      priorityQueue: true,
    },
    {
      tier: 'semester',
      name: 'Semester pass',
      priceCents: 69900,
      currency: 'inr',
      interval: 'one_time',
      pagesAllowance: 600,
      filesPerJob: 10,
      priorityQueue: false,
    },
  ],
};

export function getPlansForMarket(market: Market): BillingPlan[] {
  return PLANS[market];
}

export function getPlan(market: Market, tier: BillingPlan['tier']): BillingPlan | undefined {
  return PLANS[market].find((p) => p.tier === tier);
}
