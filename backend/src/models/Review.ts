import { Schema, model, type HydratedDocument } from 'mongoose';
import type { Grade } from '../contracts';

export interface ReviewAttrs {
  cardId: string;
  userId: string;
  grade: Grade;
  reviewedAt: Date;
  msTaken: number;
}

export type ReviewInstance = HydratedDocument<ReviewAttrs>;

const ReviewMongooseSchema = new Schema<ReviewAttrs>({
  cardId: { type: String, required: true },
  userId: { type: String, required: true },
  grade: { type: String, enum: ['again', 'hard', 'good', 'easy'], required: true },
  reviewedAt: { type: Date, required: true },
  msTaken: { type: Number, required: true },
});

ReviewMongooseSchema.index({ userId: 1, reviewedAt: -1 });

export const ReviewModel = model<ReviewAttrs>('Review', ReviewMongooseSchema);
