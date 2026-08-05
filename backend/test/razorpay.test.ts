import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';

const { TEST_WEBHOOK_SECRET } = vi.hoisted(() => ({
  TEST_WEBHOOK_SECRET: 'razorpay_test_webhook_secret',
}));

vi.mock('../src/config/env', async () => {
  const actual = await vi.importActual<typeof import('../src/config/env')>('../src/config/env');
  return { env: { ...actual.env, RAZORPAY_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET } };
});

import { verifyRazorpayWebhook } from '../src/lib/razorpay';

// Razorpay.validateWebhookSignature is plain HMAC-SHA256 over the raw body,
// hex-encoded (confirmed directly from the SDK's own source,
// node_modules/razorpay/dist/utils/razorpay-utils.js) — computed here with
// Node's own crypto, independent of the SDK, so this is a real test of
// whether the two sides agree, not a mock validating itself.
function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyRazorpayWebhook', () => {
  it('accepts a correctly signed payload', () => {
    const body = JSON.stringify({ event: 'subscription.charged', payload: { subscription: { entity: { id: 'sub_test_1' } } } });
    const signature = sign(body, TEST_WEBHOOK_SECRET);
    expect(verifyRazorpayWebhook(body, signature)).toBe(true);
  });

  it('rejects a payload tampered with after signing', () => {
    const body = JSON.stringify({ event: 'subscription.charged' });
    const signature = sign(body, TEST_WEBHOOK_SECRET);
    const tampered = body.replace('charged', 'cancelled');
    expect(verifyRazorpayWebhook(tampered, signature)).toBe(false);
  });

  it('rejects a signature produced with the wrong secret', () => {
    const body = JSON.stringify({ event: 'subscription.charged' });
    const signature = sign(body, 'a-completely-different-secret');
    expect(verifyRazorpayWebhook(body, signature)).toBe(false);
  });
});
