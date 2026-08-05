import type { Metadata } from 'next';
import { AppNav } from '@/components/nav/AppNav';
import { ReviewSession } from '@/components/review/ReviewSession';

export const metadata: Metadata = {
  title: 'Review — StudySheet',
};

export default async function ReviewPage() {
  return (
    <main className="bg-ink text-paper min-h-screen">
      <AppNav />
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-display mb-8 text-2xl">Review</h1>
        <ReviewSession />
      </div>
    </main>
  );
}
