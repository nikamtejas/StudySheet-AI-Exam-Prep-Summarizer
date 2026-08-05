import Stripe from 'stripe';
import { env } from '../config/env';
import type { BillingPlan, Market } from '../contracts';

let client: Stripe | null = null;

// Lazy, matching the established pattern for optional-until-configured
// external services (M2's Anthropic client, M8's Auth.js providers) —
// constructing with a real key only happens on first genuine use, and this
// throws clearly rather than silently no-op'ing if a real checkout/portal
// call is attempted without one configured.
export function getStripeClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  if (!client) {
    client = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return client;
}

export interface CreateCheckoutParams {
  plan: BillingPlan;
  market: Market;
  userId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createStripeCheckoutSession(params: CreateCheckoutParams): Promise<string> {
  const stripe = getStripeClient();
  const { plan, market, userId, customerEmail, successUrl, cancelUrl } = params;
  // Metadata carried on both the session and (for subscription mode) the
  // resulting Subscription object itself — Stripe doesn't copy session
  // metadata onto the subscription automatically, and the webhook handler
  // (api/routes/webhooks.ts) needs userId/tier/market on whichever object
  // its event actually hands it, without an extra API round-trip back to
  // Stripe just to look up the checkout session that created it.
  const metadata = { userId, tier: plan.tier, market };

  const session = await stripe.checkout.sessions.create({
    // Semester pass is a one-time payment, not a recurring subscription
    // (§12: "semester pass as a fixed-term entitlement") — everything else
    // is a real Stripe Subscription so upgrade/downgrade/pause/cancel all
    // go through Stripe's own subscription lifecycle.
    mode: plan.interval === 'one_time' ? 'payment' : 'subscription',
    customer_email: customerEmail,
    client_reference_id: userId,
    metadata,
    ...(plan.interval === 'month' ? { subscription_data: { metadata } } : {}),
    line_items: [
      {
        price_data: {
          currency: plan.currency,
          unit_amount: plan.priceCents,
          product_data: { name: `StudySheet ${plan.name}` },
          ...(plan.interval === 'month' ? { recurring: { interval: 'month' } } : {}),
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return session.url;
}

export async function createStripePortalSession(customerId: string, returnUrl: string): Promise<string> {
  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  return session.url;
}

// §12: "Offer pause, not cancel." Stripe's hosted customer portal doesn't
// expose pause by default (it's a portal-configuration feature, not
// guaranteed on), so this is a direct API call from our own backend rather
// than something routed through the portal.
export async function pauseStripeSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripeClient();
  await stripe.subscriptions.update(subscriptionId, { pause_collection: { behavior: 'void' } });
}

export async function resumeStripeSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripeClient();
  await stripe.subscriptions.update(subscriptionId, { pause_collection: null });
}

// Webhook verification is pure HMAC — it never makes a network call to
// Stripe and never uses the client's own API key, only
// STRIPE_WEBHOOK_SECRET. A placeholder key is fine here even with no real
// STRIPE_SECRET_KEY configured — confirmed directly (test/billing-webhooks
// .test.ts uses Stripe's own generateTestHeaderString to produce a real
// valid signature and verifies constructEvent accepts it, with no live
// Stripe account involved at all).
function getWebhookVerifierClient(): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY || 'sk_test_placeholder_for_webhook_verification_only');
}

export function verifyStripeWebhook(rawBody: string | Buffer, signature: string): Stripe.Event {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return getWebhookVerifierClient().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}
