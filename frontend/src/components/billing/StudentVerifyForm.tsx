'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyStudentStatus } from '@/lib/api';

export function StudentVerifyForm() {
  const inputId = useId();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'verified' | 'rejected'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('checking');
    const { verified } = await verifyStudentStatus(email);
    setStatus(verified ? 'verified' : 'rejected');
    if (verified) router.refresh();
  }

  if (status === 'verified') {
    return (
      <p className="text-sm" role="status">
        Verified — the Student price is now unlocked.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-semibold">
        Verify with your school email
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@school.edu"
          className="border-edge bg-surface flex-1 rounded-md border p-2 text-sm focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={status === 'checking' || !email}
          className="border-edge hover:border-muted rounded-md border px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none disabled:opacity-40"
        >
          {status === 'checking' ? 'Checking…' : 'Verify'}
        </button>
      </div>
      {status === 'rejected' && (
        <p className="text-xs text-red-400" role="alert">
          That doesn&apos;t look like a school email (.edu or .ac.*). Try a different one.
        </p>
      )}
    </form>
  );
}
