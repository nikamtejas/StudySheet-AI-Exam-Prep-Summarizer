import { Schema, model, type HydratedDocument } from 'mongoose';
import type { PlanTier } from '../contracts';

// Shares the 'users' collection with @auth/mongodb-adapter (lib/auth.ts) —
// the adapter writes/reads `name`/`email`/`emailVerified`/`image` directly
// via the raw MongoDB driver, bypassing this schema entirely, so a user
// created by sign-in won't have `plan`/`isAdmin`/`isStudentVerified` set at
// all until something else writes them. Mongoose schema `default` only
// applies to documents created *through* Mongoose, not retroactively to
// existing documents missing the field — so every read site must coalesce
// with `?? 'free'` / `?? false` rather than trusting the schema default to
// have applied. See pipeline/quota.ts's `getEffectivePlan`.
export interface UserAttrs {
  email: string;
  name: string | null;
  plan: PlanTier | undefined;
  isStudentVerified: boolean | undefined;
  isAdmin: boolean | undefined;
  createdAt: Date;
}

export type UserInstance = HydratedDocument<UserAttrs>;

const UserMongooseSchema = new Schema<UserAttrs>(
  {
    email: { type: String, required: true },
    name: { type: String, default: null },
    plan: { type: String, enum: ['free', 'student', 'pro', 'semester'], default: 'free' },
    isStudentVerified: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'users', strict: false },
);

export const UserModel = model<UserAttrs>('User', UserMongooseSchema);
