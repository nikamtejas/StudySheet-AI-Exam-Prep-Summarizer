import { env } from '../config/env';
import type { PlanTier } from '../contracts';

// docs/studysheet-build-prompt.md §12 tiers table. Only 'free' is reachable
// without M10's billing wiring (nothing promotes User.plan to any of the
// others yet) — the rest are baked in now so the quota math is already
// correct the moment a real Subscription can set one, per
// docs/studysheet-milestones.md's own build order (M8 before M10).
export const PLAN_ALLOWANCES: Record<PlanTier, number> = {
  free: env.FREE_TIER_PAGES,
  student: 500,
  pro: 1500,
  semester: 2000,
};

// Free is a one-time 30 pages, never renewed by the calendar (§12: "Pages/
// month ... Free: 30 (one-time)") — everyone else resets monthly. Semester's
// 2000 is really "over 4 months, once", not monthly — but without M10's real
// Subscription.periodStart/periodEnd to anchor a 4-month window, monthly
// reset is a documented, deliberate simplification until billing exists (see
// memory: project_m8_accounts_decisions.md).
export function periodFor(plan: PlanTier, now: Date = new Date()): string {
  if (plan === 'free') return 'lifetime';
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
