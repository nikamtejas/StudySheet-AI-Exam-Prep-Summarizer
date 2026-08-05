import { Router } from 'express';
import { z } from 'zod';
import { getPlansForMarket, getPlan } from '../../config/plans';
import { CheckoutRequestSchema, StudentVerifyRequestSchema, MarketSchema } from '../../contracts';
import { createStripeCheckoutSession, createStripePortalSession, pauseStripeSubscription } from '../../lib/stripe';
import { createRazorpayCheckout, pauseRazorpaySubscription } from '../../lib/razorpay';
import { isStudentEmail } from '../../pipeline/studentVerification';
import { SubscriptionModel } from '../../models/Subscription';
import { UserModel } from '../../models/User';
import { env } from '../../config/env';
import { asyncHandler } from '../asyncHandler';
import type {
  BillingPlansResponse,
  CheckoutResponse,
  PortalResponse,
  StudentVerifyResponse,
} from '../../contracts';

export const billingRouter = Router();

const PlansQuerySchema = z.object({ market: MarketSchema.default('global') });

// docs/studysheet-build-prompt.md §10: "GET /api/billing/plans → tiers,
// localized price + page allowance". No sign-in required — a visitor needs
// to see pricing before creating an account.
billingRouter.get(
  '/plans',
  asyncHandler(async (req, res) => {
    const parsed = PlansQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', details: parsed.error.issues });
      return;
    }
    const { market } = parsed.data;
    const body: BillingPlansResponse = { market, plans: getPlansForMarket(market) };
    res.json(body);
  }),
);

const CheckoutBodySchema = CheckoutRequestSchema.extend({ market: MarketSchema.default('global') });

// docs/studysheet-build-prompt.md §10: "POST /api/billing/checkout →
// provider session". Only creates the hosted checkout session — nothing
// here ever writes to Subscription/User.plan directly (M10's "webhooks are
// the only source of entitlement"); the actual upgrade happens once the
// resulting checkout.session.completed/subscription.charged webhook lands.
billingRouter.post(
  '/checkout',
  asyncHandler(async (req, res) => {
    if (req.identity.type !== 'user') {
      res.status(401).json({ error: 'sign_in_required' });
      return;
    }

    const parsed = CheckoutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', details: parsed.error.issues });
      return;
    }
    const { tier, provider, market } = parsed.data;

    const plan = getPlan(market, tier);
    if (!plan) {
      res.status(400).json({ error: 'invalid_plan' });
      return;
    }

    const user = await UserModel.findById(req.identity.userId);
    if (!user) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    // §12: "Verify student status... for the discounted tiers, or the
    // discount becomes your only tier" — Student is the discounted tier
    // relative to Pro, so buying it requires having verified first
    // (POST /api/billing/student-verify below).
    if (tier === 'student' && !user.isStudentVerified) {
      res.status(403).json({ error: 'student_verification_required' });
      return;
    }

    const successUrl = `${env.FRONTEND_URL}/billing?checkout=success`;
    const cancelUrl = `${env.FRONTEND_URL}/billing?checkout=cancelled`;

    let url: string;
    try {
      if (provider === 'stripe') {
        url = await createStripeCheckoutSession({
          plan,
          market,
          userId: user.id,
          customerEmail: user.email,
          successUrl,
          cancelUrl,
        });
      } else {
        url = await createRazorpayCheckout({
          plan,
          market,
          userId: user.id,
          customerEmail: user.email,
          callbackUrl: successUrl,
        });
      }
    } catch (err) {
      req.log?.error({ err, provider }, 'checkout session creation failed');
      res.status(502).json({ error: 'checkout_unavailable' });
      return;
    }

    const body: CheckoutResponse = { url };
    res.json(body);
  }),
);

// docs/studysheet-build-prompt.md §10: "POST /api/billing/portal → manage /
// pause / cancel". Stripe's hosted portal only — Razorpay has no equivalent
// (see lib/razorpay.ts); a Razorpay subscriber pauses/cancels through our
// own /api/billing/pause below instead.
billingRouter.post(
  '/portal',
  asyncHandler(async (req, res) => {
    if (req.identity.type !== 'user') {
      res.status(401).json({ error: 'sign_in_required' });
      return;
    }

    const subscription = await SubscriptionModel.findOne({ userId: req.identity.userId, provider: 'stripe' }).sort({
      periodEnd: -1,
    });
    if (!subscription) {
      res.status(404).json({ error: 'no_stripe_subscription' });
      return;
    }

    try {
      const url = await createStripePortalSession(subscription.providerCustomerId, `${env.FRONTEND_URL}/billing`);
      const body: PortalResponse = { url };
      res.json(body);
    } catch (err) {
      req.log?.error({ err }, 'stripe portal session creation failed');
      res.status(502).json({ error: 'portal_unavailable' });
    }
  }),
);

// §12: "Offer pause, not cancel." Only calls the provider's API — like
// checkout, this never writes to Subscription itself; the resulting
// customer.subscription.updated/subscription.paused webhook is what
// actually persists the pause (same "webhooks are the only source of
// entitlement" rule).
billingRouter.post(
  '/pause',
  asyncHandler(async (req, res) => {
    if (req.identity.type !== 'user') {
      res.status(401).json({ error: 'sign_in_required' });
      return;
    }

    const subscription = await SubscriptionModel.findOne({ userId: req.identity.userId, status: 'active' }).sort({
      periodEnd: -1,
    });
    if (!subscription) {
      res.status(404).json({ error: 'no_active_subscription' });
      return;
    }

    try {
      if (subscription.provider === 'stripe') {
        await pauseStripeSubscription(subscription.providerSubId);
      } else {
        await pauseRazorpaySubscription(subscription.providerSubId);
      }
    } catch (err) {
      req.log?.error({ err }, 'pause request failed');
      res.status(502).json({ error: 'pause_failed' });
      return;
    }

    // 202, not 200 — the pause has been *requested* from the provider; it
    // takes effect in our own data once their webhook confirms it.
    res.status(202).json({ status: 'pause_requested' });
  }),
);

billingRouter.post(
  '/student-verify',
  asyncHandler(async (req, res) => {
    const parsed = StudentVerifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', details: parsed.error.issues });
      return;
    }

    const verified = isStudentEmail(parsed.data.email);
    if (verified && req.identity.type === 'user') {
      await UserModel.findByIdAndUpdate(req.identity.userId, { isStudentVerified: true });
    }

    const body: StudentVerifyResponse = { verified };
    res.json(body);
  }),
);
