import { Router, raw } from 'express';
import type Stripe from 'stripe';
import { createHash } from 'node:crypto';
import { verifyStripeWebhook } from '../../lib/stripe';
import { verifyRazorpayWebhook } from '../../lib/razorpay';
import { WebhookEventModel } from '../../models/WebhookEvent';
import { isDuplicateKeyError } from '../../lib/errors';
import { getPlan } from '../../config/plans';
import {
  activateSubscription,
  markPastDue,
  pauseSubscription,
  cancelSubscription,
  refreshSubscriptionPeriod,
} from '../../pipeline/billingEvents';
import { logger } from '../../lib/logger';
import type { BillableTier, Market } from '../../contracts';

export const webhooksRouter = Router();

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTH_DAYS = 30;
const SEMESTER_DAYS = 4 * MONTH_DAYS;

// Idempotency (docs/studysheet-milestones.md M10: "replaying a webhook
// twice changes nothing"). Recording the event id via a unique-index-backed
// insert *before* doing any entitlement work is what makes this safe even
// under concurrent redelivery, not just sequential — the loser of a race
// gets a duplicate-key error and treats it as "already handled," never
// re-runs the handler.
async function claimEvent(provider: 'stripe' | 'razorpay', eventId: string): Promise<boolean> {
  try {
    await WebhookEventModel.create({ provider, eventId, processedAt: new Date() });
    return true;
  } catch (err) {
    if (isDuplicateKeyError(err)) return false;
    throw err;
  }
}

interface CheckoutMetadata {
  userId: string;
  tier: BillableTier;
  market: Market;
}

function parseCheckoutMetadata(metadata: Stripe.Metadata | null): CheckoutMetadata | null {
  const userId = metadata?.userId;
  const tier = metadata?.tier as BillableTier | undefined;
  const market = metadata?.market as Market | undefined;
  if (!userId || !tier || !market) return null;
  return { userId, tier, market };
}

// Period dates are computed from our own plan config rather than trusting
// Stripe's current_period_start/end fields — deliberately: this can't be
// tested against a live Stripe account in this environment, and avoiding a
// dependency on the exact field shape/API-version behavior of Stripe's
// Subscription object reduces the surface area that could be silently wrong
// versus what's actually documented and verifiable here. A real deployment
// with a live account should switch to reading Stripe's authoritative
// period fields once that can actually be verified end to end.
function computePeriod(intervalDays: number, now = new Date()): { periodStart: Date; periodEnd: Date } {
  return { periodStart: now, periodEnd: new Date(now.getTime() + intervalDays * MS_PER_DAY) };
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const meta = parseCheckoutMetadata(session.metadata);
      if (!meta || !session.customer) {
        logger.warn({ eventId: event.id }, 'stripe checkout.session.completed missing metadata — skipping');
        return;
      }
      const plan = getPlan(meta.market, meta.tier);
      if (!plan) return;

      const providerSubId =
        typeof session.subscription === 'string'
          ? session.subscription
          : (session.subscription?.id ?? session.id);
      const { periodStart, periodEnd } = computePeriod(plan.interval === 'one_time' ? SEMESTER_DAYS : MONTH_DAYS);

      await activateSubscription({
        userId: meta.userId,
        provider: 'stripe',
        providerCustomerId: String(session.customer),
        providerSubId,
        tier: meta.tier,
        pageAllowance: plan.pagesAllowance,
        periodStart,
        periodEnd,
      });
      return;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
      const providerSubId = typeof subId === 'string' ? subId : subId?.id;
      if (providerSubId) await markPastDue('stripe', providerSubId);
      return;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      if (sub.pause_collection) {
        const resumesAt = sub.pause_collection.resumes_at ? new Date(sub.pause_collection.resumes_at * 1000) : null;
        await pauseSubscription('stripe', sub.id, resumesAt);
      } else if (sub.status === 'active') {
        const meta = parseCheckoutMetadata(sub.metadata);
        const plan = meta ? getPlan(meta.market, meta.tier) : undefined;
        const { periodStart, periodEnd } = computePeriod(plan?.interval === 'one_time' ? SEMESTER_DAYS : MONTH_DAYS);
        await refreshSubscriptionPeriod('stripe', sub.id, periodStart, periodEnd);
      }
      return;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await cancelSubscription('stripe', sub.id);
      return;
    }
    default:
      return;
  }
}

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    subscription?: { entity: { id: string; notes?: Record<string, string> } };
    payment_link?: { entity: { id: string; notes?: Record<string, string> } };
  };
}

async function handleRazorpayEvent(payload: RazorpayWebhookPayload): Promise<void> {
  const subEntity = payload.payload.subscription?.entity;
  const linkEntity = payload.payload.payment_link?.entity;

  switch (payload.event) {
    case 'subscription.activated':
    case 'subscription.charged': {
      if (!subEntity) return;
      const meta = parseCheckoutMetadata((subEntity.notes as Stripe.Metadata) ?? null);
      if (!meta) {
        logger.warn({ event: payload.event }, 'razorpay subscription event missing notes — skipping');
        return;
      }
      const plan = getPlan(meta.market, meta.tier);
      if (!plan) return;
      const { periodStart, periodEnd } = computePeriod(MONTH_DAYS);
      await activateSubscription({
        userId: meta.userId,
        provider: 'razorpay',
        providerCustomerId: meta.userId,
        providerSubId: subEntity.id,
        tier: meta.tier,
        pageAllowance: plan.pagesAllowance,
        periodStart,
        periodEnd,
      });
      return;
    }
    case 'payment_link.paid': {
      if (!linkEntity) return;
      const meta = parseCheckoutMetadata((linkEntity.notes as Stripe.Metadata) ?? null);
      if (!meta) return;
      const plan = getPlan(meta.market, meta.tier);
      if (!plan) return;
      const { periodStart, periodEnd } = computePeriod(SEMESTER_DAYS);
      await activateSubscription({
        userId: meta.userId,
        provider: 'razorpay',
        providerCustomerId: meta.userId,
        providerSubId: linkEntity.id,
        tier: meta.tier,
        pageAllowance: plan.pagesAllowance,
        periodStart,
        periodEnd,
      });
      return;
    }
    case 'subscription.pending':
    case 'subscription.halted': {
      if (subEntity) await markPastDue('razorpay', subEntity.id);
      return;
    }
    case 'subscription.paused': {
      if (subEntity) await pauseSubscription('razorpay', subEntity.id, null);
      return;
    }
    case 'subscription.cancelled': {
      if (subEntity) await cancelSubscription('razorpay', subEntity.id);
      return;
    }
    default:
      return;
  }
}

// Mounted before express.json() in api/app.ts (its own express.raw() here
// is what makes the raw body available at all) and before cors()/
// resolveIdentity/csrfProtection — docs/studysheet-build-prompt.md §10:
// "Webhook routes are exempt from CORS and CSRF and verify provider
// signatures on the raw body — mount them before the JSON body parser or
// signature checks will fail."
webhooksRouter.post('/stripe', raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') {
    res.status(400).json({ error: 'missing_signature' });
    return;
  }

  let event: Stripe.Event;
  try {
    event = verifyStripeWebhook(req.body as Buffer, signature);
  } catch (err) {
    req.log?.warn({ err }, 'stripe webhook signature verification failed');
    res.status(400).json({ error: 'invalid_signature' });
    return;
  }

  const isNew = await claimEvent('stripe', event.id);
  if (isNew) {
    await handleStripeEvent(event);
  }

  // 2xx regardless of new-vs-replay — Stripe retries anything short of
  // that, and a replay isn't a failure.
  res.status(200).json({ received: true });
});

webhooksRouter.post('/razorpay', raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  if (typeof signature !== 'string') {
    res.status(400).json({ error: 'missing_signature' });
    return;
  }

  const rawBody = (req.body as Buffer).toString('utf8');
  let valid: boolean;
  try {
    valid = verifyRazorpayWebhook(rawBody, signature);
  } catch (err) {
    req.log?.warn({ err }, 'razorpay webhook verification errored');
    res.status(400).json({ error: 'invalid_signature' });
    return;
  }
  if (!valid) {
    res.status(400).json({ error: 'invalid_signature' });
    return;
  }

  // Razorpay doesn't include a stable top-level event id the way Stripe
  // does (evt_...) — their documented retry behavior resends the identical
  // payload bytes, so a hash of the raw body is a reliable dedup key for
  // "this exact delivery," independent of any single event type's payload
  // shape.
  const eventId = createHash('sha256').update(rawBody).digest('hex');
  const isNew = await claimEvent('razorpay', eventId);

  if (isNew) {
    const payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
    await handleRazorpayEvent(payload);
  }

  res.status(200).json({ received: true });
});
