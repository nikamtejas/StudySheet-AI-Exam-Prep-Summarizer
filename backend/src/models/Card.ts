import { Schema, model, type HydratedDocument } from 'mongoose';
import type { CardKind } from '../contracts';

export interface SrsState {
  ease: number;
  intervalDays: number;
  dueAt: Date;
  reps: number;
  lapses: number;
}

export interface CardAttrs {
  deckId: string;
  userId: string;
  front: string;
  back: string;
  kind: CardKind;
  pageRef: number;
  srs: SrsState;
  createdAt: Date;
}

export type CardInstance = HydratedDocument<CardAttrs>;

const SrsMongooseSchema = new Schema<SrsState>(
  {
    ease: { type: Number, required: true },
    intervalDays: { type: Number, required: true },
    dueAt: { type: Date, required: true },
    reps: { type: Number, required: true },
    lapses: { type: Number, required: true },
  },
  { _id: false },
);

const CardMongooseSchema = new Schema<CardAttrs>(
  {
    deckId: { type: String, required: true },
    userId: { type: String, required: true },
    front: { type: String, required: true },
    back: { type: String, required: true },
    kind: { type: String, enum: ['basic', 'cloze', 'method', 'exam'], required: true },
    pageRef: { type: Number, required: true },
    srs: { type: SrsMongooseSchema, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// docs/studysheet-build-prompt.md §8: "Card.userId + srs.dueAt (the review
// queue query)" — GET /api/review/queue filters {userId, srs.dueAt: {$lte:
// now}} sorted by srs.dueAt, and this compound index is what keeps that
// under the M9 gate's 50ms budget at 10k cards (verified directly,
// test/review-queue-perf.test.ts).
CardMongooseSchema.index({ userId: 1, 'srs.dueAt': 1 });
CardMongooseSchema.index({ deckId: 1 });

export const CardModel = model<CardAttrs>('Card', CardMongooseSchema);
