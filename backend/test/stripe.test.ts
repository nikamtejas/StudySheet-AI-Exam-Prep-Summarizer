import { describe, it, expect, vi } from 'vitest';
import Stripe from 'stripe';

// vi.mock factories are hoisted above regular top-level declarations, so the
// secret has to be declared via vi.hoisted() to be visible inside one.
const { TEST_WEBHOOK_SECRET } = vi.hoisted(() => ({
  TEST_WEBHOOK_SECRET: 'whsec_test_secret_for_signature_verification_only',
}));

vi.mock('../src/config/env', async () => {
  const actual = await vi.importActual<typeof import('../src/config/env')>('../src/config/env');
  return { env: { ...actual.env, STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET } };
});

import { verifyStripeWebhook } from '../src/lib/stripe';

// Real HMAC verification, no live Stripe account or mocked SDK involved —
// Stripe's own SDK ships generateTestHeaderString specifically for this:
// producing a signature for a synthetic payload the same way their server
// would, so constructEvent's real verification logic is what's actually
// being exercised (docs/studysheet-milestones.md M10: webhook signatures
// verified on the raw body).
describe('verifyStripeWebhook', () => {
  it('accepts a correctly signed payload and returns the parsed event', () => {
    const payload = JSON.stringify({
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123' } },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: TEST_WEBHOOK_SECRET });

    const event = verifyStripeWebhook(payload, header);
    expect(event.id).toBe('evt_test_123');
    expect(event.type).toBe('checkout.session.completed');
  });

  it('rejects a payload that was tampered with after signing', () => {
    const payload = JSON.stringify({ id: 'evt_test_456', type: 'checkout.session.completed' });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: TEST_WEBHOOK_SECRET });
    const tampered = payload.replace('evt_test_456', 'evt_test_999');

    expect(() => verifyStripeWebhook(tampered, header)).toThrow();
  });

  it('rejects a signature produced with the wrong secret', () => {
    const payload = JSON.stringify({ id: 'evt_test_789', type: 'checkout.session.completed' });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_a_completely_different_secret' });

    expect(() => verifyStripeWebhook(payload, header)).toThrow();
  });

  it('rejects a missing signature header', () => {
    const payload = JSON.stringify({ id: 'evt_test_000', type: 'checkout.session.completed' });
    expect(() => verifyStripeWebhook(payload, '')).toThrow();
  });
});
