import type { Metadata } from 'next';
import { SignInForm } from '@/components/signin/SignInForm';

export const metadata: Metadata = {
  title: 'Sign in — StudySheet',
};

// No AppNav here deliberately — a sign-in page showing its own "Sign in"
// link would be a confusing loop, and there's nothing else in the nav
// (Library, usage) that makes sense to show before the user has an identity
// worth showing it for.
export default function SignInPage() {
  return (
    <main className="bg-ink text-paper flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display mb-6 text-2xl">Sign in</h1>
        <SignInForm />
      </div>
    </main>
  );
}
