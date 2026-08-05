'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBillingPortalSession, pauseBillingSubscription, ApiError } from '@/lib/api';

// §12: "Offer pause, not cancel." Cancel is still reachable — through the
// Stripe portal this "Manage billing" button opens — but pause is the one-
// tap action surfaced directly here since it's the one §12 calls out as
// recovering would-be cancellations.
export function ManageSubscription({ provider }: { provider: 'stripe' | 'razorpay' }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'portal' | 'pause' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function openPortal() {
    setBusy('portal');
    setMessage(null);
    try {
      const { url } = await createBillingPortalSession();
      window.location.href = url;
    } catch (err) {
      setMessage(err instanceof ApiError && err.code === 'portal_unavailable' ? 'Billing portal isn\'t configured yet.' : "Couldn't open billing management.");
      setBusy(null);
    }
  }

  async function requestPause() {
    setBusy('pause');
    setMessage(null);
    try {
      await pauseBillingSubscription();
      setMessage('Pause requested — this takes effect shortly.');
      router.refresh();
    } catch {
      setMessage("Couldn't pause right now. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void requestPause()}
          disabled={busy !== null}
          className="border-edge hover:border-muted rounded-md border px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none disabled:opacity-50"
        >
          {busy === 'pause' ? 'Pausing…' : 'Pause subscription'}
        </button>
        {provider === 'stripe' && (
          <button
            type="button"
            onClick={() => void openPortal()}
            disabled={busy !== null}
            className="border-edge hover:border-muted rounded-md border px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none disabled:opacity-50"
          >
            {busy === 'portal' ? 'Opening…' : 'Manage billing'}
          </button>
        )}
      </div>
      {message && <p className="text-muted text-xs">{message}</p>}
    </div>
  );
}
