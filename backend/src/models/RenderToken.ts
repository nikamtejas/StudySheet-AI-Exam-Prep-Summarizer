import { Schema, model, type HydratedDocument } from 'mongoose';

export interface RenderTokenAttrs {
  jti: string;
  summaryId: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export type RenderTokenInstance = HydratedDocument<RenderTokenAttrs>;

const RenderTokenMongooseSchema = new Schema<RenderTokenAttrs>(
  {
    jti: { type: String, required: true, unique: true },
    summaryId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Tokens are short-lived and single-use by design — let Mongo clean up
// expired ones automatically instead of accumulating them forever.
RenderTokenMongooseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RenderTokenModel = model<RenderTokenAttrs>('RenderToken', RenderTokenMongooseSchema);
