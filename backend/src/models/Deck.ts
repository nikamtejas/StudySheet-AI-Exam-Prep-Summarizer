import { Schema, model, type HydratedDocument } from 'mongoose';

export interface DeckAttrs {
  summaryId: string;
  userId: string;
  cardCount: number;
  source: 'auto' | 'manual';
  createdAt: Date;
}

export type DeckInstance = HydratedDocument<DeckAttrs>;

const DeckMongooseSchema = new Schema<DeckAttrs>(
  {
    summaryId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    cardCount: { type: Number, default: 0 },
    source: { type: String, enum: ['auto', 'manual'], default: 'auto' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const DeckModel = model<DeckAttrs>('Deck', DeckMongooseSchema);
