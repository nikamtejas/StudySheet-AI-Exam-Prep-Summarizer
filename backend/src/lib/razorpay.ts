import Razorpay from 'razorpay';
import { env } from '../config/env';
import type { BillingPlan, Market } from '../contracts';

let client: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error('RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are not configured');
  }
  if (!client) {
    client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  }
  return client;
}

export interface CreateRazorpayCheckoutParams {
  plan: BillingPlan;
  market: Market;
  userId: string;
  customerEmail: string;
  // Razorpay Payment Links require a contact number for the customer
  // (there's no equivalent requirement for Subscriptions) — this app has
  // never collected one (Auth.js only ever asks for email). A known,
  // documented data gap: production use of the Semester-pass path would
  // need to actually collect this during checkout, not default it.
  customerPhone?: string;
  callbackUrl: string;
}

// Razorpay has no inline "ad-hoc price" concept like Stripe's price_data —
// a recurring charge needs a real Plan object first. This creates one on
// every checkout rather than caching/pre-provisioning plan ids, which is
// the simple, correct-but-not-production-optimized choice: a real deployment
// would provision plans once (e.g. in a setup script) and reuse their ids,
// but that step itself needs a live Razorpay account to run at all, so
// there's nothing to verify by building it further in this environment.
async function createOrGetPlanId(plan: BillingPlan): Promise<string> {
  const razorpay = getRazorpayClient();
  const created = await razorpay.plans.create({
    period: 'monthly',
    interval: 1,
    item: {
      name: `StudySheet ${plan.name}`,
      amount: plan.priceCents,
      currency: plan.currency.toUpperCase(),
    },
  });
  return created.id;
}

export async function createRazorpayCheckout(params: CreateRazorpayCheckoutParams): Promise<string> {
  const razorpay = getRazorpayClient();
  const { plan, market, userId, customerEmail, customerPhone, callbackUrl } = params;
  const notes = { userId, tier: plan.tier, market };

  if (plan.interval === 'one_time') {
    // Semester pass — a single payment, no recurring Plan needed.
    const link = await razorpay.paymentLink.create({
      amount: plan.priceCents,
      currency: plan.currency.toUpperCase(),
      description: `StudySheet ${plan.name}`,
      customer: { email: customerEmail, contact: customerPhone ?? '' },
      reference_id: userId,
      notes,
      callback_url: callbackUrl,
      callback_method: 'get',
    });
    return link.short_url;
  }

  const planId = await createOrGetPlanId(plan);
  // total_count: how many billing cycles Razorpay will run before the
  // subscription naturally ends — a large number here just means "keep
  // renewing monthly until canceled," matching Stripe's subscription mode
  // (no fixed end date).
  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    total_count: 120,
    quantity: 1,
    notes,
  });
  return subscription.short_url;
}

export async function pauseRazorpaySubscription(subscriptionId: string): Promise<void> {
  const razorpay = getRazorpayClient();
  await razorpay.subscriptions.pause(subscriptionId, { pause_at: 'now' });
}

export async function resumeRazorpaySubscription(subscriptionId: string): Promise<void> {
  const razorpay = getRazorpayClient();
  await razorpay.subscriptions.resume(subscriptionId, { resume_at: 'now' });
}

// Razorpay's signature scheme is plain HMAC-SHA256 over the raw body, hex-
// encoded, compared against the X-Razorpay-Signature header —
// Razorpay.validateWebhookSignature is a *static* method (no client
// instance, no live account needed), so this works the same whether or not
// RAZORPAY_KEY_ID/SECRET are configured at all. Confirmed directly
// (test/razorpay.test.ts computes a real HMAC with Node's own crypto and
// checks this accepts it — no live account, no mocked SDK).
export function verifyRazorpayWebhook(rawBody: string, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');
  }
  return Razorpay.validateWebhookSignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET);
}
