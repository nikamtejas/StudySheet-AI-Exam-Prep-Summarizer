import { env } from '../config/env';
import type { PlanTier } from '../contracts';

// docs/studysheet-build-prompt.md §12 tiers table — global-market defaults,
// used as a fallback (see lib/quota.ts's resolveBilling) when a paid plan
// somehow has no real Subscription document to read a market-specific
// pageAllowance from. The real, authoritative allowance for a paid user
// always comes from their own Subscription.pageAllowance (config/plans.ts,
// snapshotted at checkout — market-specific, per §12's "adjust the
// allowance, not just the price").
export const PLAN_ALLOWANCES: Record<PlanTier, number> = {
  free: env.FREE_TIER_PAGES,
  student: 500,
  pro: 1500,
  semester: 2000,
};

// Free is a one-time 30 pages, never renewed by the calendar (§12: "Pages/
// month ... Free: 30 (one-time)"). Every paid plan's period is anchored to
// its real Subscription.periodStart (M10) — a semester pass's "2000 total
// over 4 months" is genuinely one period spanning 4 months, not 4 separate
// monthly resets, because periodStart doesn't change until the subscription
// itself renews or is replaced. The monthly-calendar fallback only fires for
// a paid plan with no resolvable Subscription record, which shouldn't
// normally happen — see lib/quota.ts's resolveBilling.
export function periodFor(plan: PlanTier, periodStart?: Date, now: Date = new Date()): string {
  if (plan === 'free') return 'lifetime';
  if (periodStart) return periodStart.toISOString();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Matches frontend/src/components/upload/UploadForm.tsx's own estimate
// constants exactly (§12's unit economics table) — one formula, not two
// independently-drifting copies. The frontend shows a range before a file's
// pages are classified; this is the precise version once textPageCount/
// visionPageCount are already known (Document, from M1's probe).
const COST_PER_PAGE_TYPED_CENTS = 0.4;
const COST_PER_PAGE_VISION_CENTS = 1.4;

export function estimateCostCents(textPages: number, visionPages: number): number {
  return Math.round(textPages * COST_PER_PAGE_TYPED_CENTS + visionPages * COST_PER_PAGE_VISION_CENTS);
}

export interface QuotaCheck {
  allowance: number;
  used: number;
  reserved: number;
  requested: number;
}

// Pure predicate so the race-condition-critical Mongo query (lib/quota.ts)
// and its unit tests both reference the exact same inequality.
export function canReserve({ allowance, used, reserved, requested }: QuotaCheck): boolean {
  return used + reserved + requested <= allowance;
}
