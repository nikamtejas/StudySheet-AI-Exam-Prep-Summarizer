import { Schema, model, type HydratedDocument } from 'mongoose';

// Not in docs/studysheet-build-prompt.md §8's data model list, but required
// by docs/studysheet-milestones.md M10's own gate: "replaying a webhook
// twice changes nothing." A provider (Stripe, Razorpay) retries webhook
// delivery on anything short of a 2xx response, and network blips can
// duplicate an otherwise-successful delivery too — this is the record that
// makes a second delivery of the same event a no-op rather than a second
// entitlement change.
export interface WebhookEventAttrs {
  provider: 'stripe' | 'razorpay';
  eventId: string;
  processedAt: Date;
}

export type WebhookEventInstance = HydratedDocument<WebhookEventAttrs>;

const WebhookEventMongooseSchema = new Schema<WebhookEventAttrs>({
  provider: { type: String, enum: ['stripe', 'razorpay'], required: true },
  eventId: { type: String, required: true },
  processedAt: { type: Date, required: true },
});

WebhookEventMongooseSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export const WebhookEventModel = model<WebhookEventAttrs>('WebhookEvent', WebhookEventMongooseSchema);
