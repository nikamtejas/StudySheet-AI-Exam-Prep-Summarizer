'use client';

import { useState } from 'react';
import { createCheckout, ApiError } from '@/lib/api';
import type { BillableTier, Provider } from '@/contracts';

export function CheckoutButton({ tier, provider, label }: { tier: BillableTier; provider: Provider; label: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const { url } = await createCheckout({ tier, provider });
      window.location.href = url;
    } catch (err) {
      setStatus('error');
      if (err instanceof ApiError && err.code === 'student_verification_required') {
        setErrorMessage('Verify your student email first (below) to unlock this price.');
      } else if (err instanceof ApiError && err.code === 'sign_in_required') {
        setErrorMessage('Sign in first to subscribe.');
      } else if (err instanceof ApiError && err.code === 'checkout_unavailable') {
        setErrorMessage(`${provider === 'stripe' ? 'Stripe' : 'Razorpay'} checkout isn't configured yet.`);
      } else {
        setErrorMessage("Couldn't start checkout. Try again in a moment.");
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={status === 'loading'}
        className="bg-amber text-ink rounded-md px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none disabled:opacity-50"
      >
        {status === 'loading' ? 'Starting…' : label}
      </button>
      {errorMessage && (
        <p className="text-xs text-red-400" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
