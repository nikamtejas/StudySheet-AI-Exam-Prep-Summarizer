import { z } from 'zod';

// docs/studysheet-build-prompt.md §12 tiers table. 'semester' allowance is its
// total for the whole 4-month pass, not a monthly figure — see
// pipeline/quota.ts for how that distinction is handled without a real
// Subscription record yet (M10 wires up billing; until then every account is
// 'free').
export const PlanTierSchema = z.enum(['free', 'student', 'pro', 'semester']);
export type PlanTier = z.infer<typeof PlanTierSchema>;

export const SessionUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  plan: PlanTierSchema,
  isAdmin: z.boolean(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

// What GET /api/auth/identity returns — a session user when signed in, or
// null when the caller is only carrying the anonymous trial cookie (still a
// valid identity for quota/ownership purposes, just not an authenticated
// one — see api/middleware/identity.ts).
export const IdentityResponseSchema = z.object({
  user: SessionUserSchema.nullable(),
  isAnonymous: z.boolean(),
});
export type IdentityResponse = z.infer<typeof IdentityResponseSchema>;

export const UsageResponseSchema = z.object({
  plan: PlanTierSchema,
  period: z.string(),
  pagesAllowance: z.number().int().nonnegative(),
  pagesUsed: z.number().int().nonnegative(),
  pagesReserved: z.number().int().nonnegative(),
  pagesRemaining: z.number().int(),
});
export type UsageResponse = z.infer<typeof UsageResponseSchema>;

export const LibraryItemSchema = z.object({
  summaryId: z.string(),
  jobId: z.string(),
  filename: z.string(),
  pageCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type LibraryItem = z.infer<typeof LibraryItemSchema>;

export const LibraryResponseSchema = z.object({
  items: z.array(LibraryItemSchema),
  page: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type LibraryResponse = z.infer<typeof LibraryResponseSchema>;

export const AdminJobRowSchema = z.object({
  jobId: z.string(),
  userId: z.string(),
  status: z.string(),
  stage: z.string(),
  costCents: z.number().nonnegative(),
  createdAt: z.string(),
});
export type AdminJobRow = z.infer<typeof AdminJobRowSchema>;

export const AdminSummarySchema = z.object({
  jobs: z.array(AdminJobRowSchema),
  totalJobs: z.number().int().nonnegative(),
  failureRate: z.number().min(0).max(1),
  totalCostCents: z.number().nonnegative(),
  costPerActiveUserCents: z.number().nonnegative(),
});
export type AdminSummary = z.infer<typeof AdminSummarySchema>;
