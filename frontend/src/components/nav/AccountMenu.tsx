'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { signOut } from '@/lib/api';

// The one client "island" this nav needs — everything else (identity/usage
// fetch, the sign-in link) renders server-side. Same direction as M7's
// preview islands: keep the interactive surface as small as possible so the
// rest of the nav never needs 'use client'.
export function AccountMenu({ email }: { email: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted font-mono text-xs">{email}</span>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="text-muted hover:text-paper focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none disabled:opacity-50"
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}
