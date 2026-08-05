import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getBillingPlans, getUsage, getIdentity } from '@/lib/api';
import { AppNav } from '@/components/nav/AppNav';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { StudentVerifyForm } from '@/components/billing/StudentVerifyForm';
import { ManageSubscription } from '@/components/billing/ManageSubscription';
import type { Market } from '@/contracts';

export const metadata: Metadata = {
  title: 'Billing — StudySheet',
};

function formatPrice(cents: number, currency: string): string {
  if (cents === 0) return 'Free';
  const amount = (cents / 100).toFixed(2);
  return currency === 'inr' ? `₹${amount}` : `$${amount}`;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string; checkout?: string }>;
}) {
  const { market: marketParam, checkout } = await searchParams;
  const market: Market = marketParam === 'in' ? 'in' : 'global';

  const cookieHeader = (await cookies()).toString();
  const [plansResponse, usage, identity] = await Promise.all([
    getBillingPlans(market),
    getUsage(cookieHeader).catch(() => null),
    getIdentity(cookieHeader).catch(() => null),
  ]);

  return (
    <main className="bg-ink text-paper min-h-screen">
      <AppNav />
      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="font-display text-2xl">Billing</h1>

        {checkout === 'success' && (
          <p className="border-edge bg-surface mt-4 rounded-md border p-3 text-sm" role="status">
            Checkout complete — your plan updates once payment is confirmed.
          </p>
        )}

        {usage && (
          <div className="border-edge bg-surface mt-6 rounded-md border p-4">
            <p className="font-mono text-sm">
              {Math.max(usage.pagesRemaining, 0)} / {usage.pagesAllowance} pages left this period
            </p>
            {usage.renewalDate && (
              <p className="text-muted mt-1 text-xs">
                Renews {new Date(usage.renewalDate).toLocaleDateString()}
                {usage.subscriptionStatus === 'paused' && ' — currently paused'}
                {usage.subscriptionStatus === 'past_due' && ' — payment past due'}
              </p>
            )}
            {usage.subscriptionStatus && (
              <div className="mt-3">
                <ManageSubscription provider="stripe" />
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex gap-3 text-sm">
          <a href="/billing?market=global" className={market === 'global' ? 'text-teal underline' : 'text-muted'}>
            Global (USD)
          </a>
          <a href="/billing?market=in" className={market === 'in' ? 'text-teal underline' : 'text-muted'}>
            India (INR)
          </a>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plansResponse.plans.map((plan) => (
            <div key={plan.tier} className="border-edge bg-surface flex flex-col gap-3 rounded-md border p-4">
              <h2 className="font-display text-lg">{plan.name}</h2>
              <p className="text-2xl">
                {formatPrice(plan.priceCents, plan.currency)}
                {plan.interval === 'month' && plan.priceCents > 0 && (
                  <span className="text-muted text-sm">/mo</span>
                )}
              </p>
              <p className="text-muted font-mono text-xs">
                {plan.pagesAllowance} pages{plan.interval === 'one_time' ? ' total' : '/mo'} · {plan.filesPerJob}{' '}
                files/job
              </p>
              {plan.tier !== 'free' && (
                <CheckoutButton
                  tier={plan.tier as 'student' | 'pro' | 'semester'}
                  provider={market === 'in' ? 'razorpay' : 'stripe'}
                  label={`Choose ${plan.name}`}
                />
              )}
            </div>
          ))}
        </div>

        {identity?.user && (
          <div className="mt-10">
            <StudentVerifyForm />
          </div>
        )}
      </div>
    </main>
  );
}
