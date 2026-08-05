'use client';

import { useId, useState } from 'react';
import { signInWithEmail, signInWithGoogle } from '@/lib/api';

export function SignInForm() {
  const emailInputId = useId();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    try {
      await signInWithEmail(email);
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <p className="text-sm" role="status">
        Check <span className="font-mono">{email}</span> for a sign-in link.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
        <label htmlFor={emailInputId} className="text-sm font-semibold">
          Email
        </label>
        <input
          id={emailInputId}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@school.edu"
          className="border-edge bg-surface w-full rounded-md border p-3 text-sm focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={status === 'sending' || !email}
          className="bg-amber text-ink rounded-md px-6 py-3 text-base font-semibold focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none disabled:opacity-40"
        >
          {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
        </button>
        {status === 'error' && (
          <p className="text-sm text-red-400" role="alert">
            Couldn&apos;t send that — try again.
          </p>
        )}
      </form>

      <div className="border-edge flex items-center gap-3 border-t pt-4 text-xs">
        <span className="text-muted">or</span>
      </div>

      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        className="border-edge hover:border-muted rounded-md border px-6 py-3 text-base font-semibold focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none"
      >
        Continue with Google
      </button>
    </div>
  );
}
