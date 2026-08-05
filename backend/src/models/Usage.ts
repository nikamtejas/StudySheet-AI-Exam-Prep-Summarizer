import { Schema, model, type HydratedDocument } from 'mongoose';

// docs/studysheet-build-prompt.md §8: one doc per user per period. `period`
// is 'YYYY-MM' for monthly-reset plans, or the constant 'lifetime' for the
// free tier's one-time 30 pages (§12: "Pages/month ... Free: 30 (one-time)"
// — a free account never gets a second 30-page grant just because a month
// rolled over). See pipeline/quota.ts for the period-selection logic this
// schema doesn't itself encode.
//
// `pagesReserved` exists only in-flight, between a job being queued and it
// finishing (success or failure) — it's not in the §8 spec because the spec
// doesn't dictate the reservation *mechanism*, only that one exists
// ("reserve-before-queue, release-on-failure, commit-on-success",
// docs/studysheet-milestones.md M8). Committed usage lives in `pagesUsed`;
// `pagesReserved` is what's provisionally held against pages a job hasn't
// finished consuming yet, so `pagesUsed + pagesReserved` is always the true
// "spoken for" total a concurrent submission must check against.
export interface UsageAttrs {
  userId: string;
  period: string;
  pagesUsed: number;
  pagesReserved: number;
  pagesVision: number;
  pagesText: number;
  jobCount: number;
  costCents: number;
}

export type UsageInstance = HydratedDocument<UsageAttrs>;

const UsageMongooseSchema = new Schema<UsageAttrs>({
  userId: { type: String, required: true },
  period: { type: String, required: true },
  pagesUsed: { type: Number, default: 0 },
  pagesReserved: { type: Number, default: 0 },
  pagesVision: { type: Number, default: 0 },
  pagesText: { type: Number, default: 0 },
  jobCount: { type: Number, default: 0 },
  costCents: { type: Number, default: 0 },
});

UsageMongooseSchema.index({ userId: 1, period: 1 }, { unique: true });

export const UsageModel = model<UsageAttrs>('Usage', UsageMongooseSchema);
