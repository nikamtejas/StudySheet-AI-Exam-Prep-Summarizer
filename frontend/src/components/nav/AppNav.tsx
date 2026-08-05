import Link from 'next/link';
import { cookies } from 'next/headers';
import { getIdentity, getUsage } from '@/lib/api';
import { AccountMenu } from './AccountMenu';

// A pure Server Component (only AccountMenu's sign-out button is client-side)
// — same reasoning as M7's preview route: fetching identity/usage here means
// nothing about the auth state needs to leak into a client bundle just to
// decide "show a sign-in link or an email." Deliberately not in
// (app)/layout.tsx: process/[jobId] and preview/[summaryId] both use
// height-sensitive h-screen flex layouts already verified in M6/M7, and
// stacking a nav bar above them would push their content past 100vh. Added
// individually to the pages that scroll normally instead (landing, upload,
// solve, library).
export async function AppNav() {
  const cookieHeader = (await cookies()).toString();
  const [identity, usage] = await Promise.all([
    getIdentity(cookieHeader).catch(() => null),
    getUsage(cookieHeader).catch(() => null),
  ]);

  return (
    <nav className="border-edge bg-ink flex items-center justify-between border-b px-6 py-3">
      <Link href="/" className="font-display text-sm">
        StudySheet
      </Link>
      <div className="flex items-center gap-6">
        <Link href="/library" className="text-muted hover:text-paper text-sm">
          Library
        </Link>
        {usage && (
          <span className="text-muted font-mono text-xs">
            {Math.max(usage.pagesRemaining, 0)} / {usage.pagesAllowance} pages left
          </span>
        )}
        {identity?.user ? (
          <AccountMenu email={identity.user.email} />
        ) : (
          <Link
            href="/signin"
            className="text-paper hover:text-teal focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none text-sm font-semibold"
          >
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
