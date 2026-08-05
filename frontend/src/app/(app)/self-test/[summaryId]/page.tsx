import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getDeck } from '@/lib/api';
import { AppNav } from '@/components/nav/AppNav';
import { SelfTestSession } from '@/components/selftest/SelfTestSession';

export const metadata: Metadata = {
  title: 'Self-test — StudySheet',
};

export default async function SelfTestPage({ params }: { params: Promise<{ summaryId: string }> }) {
  const { summaryId } = await params;
  const cookieHeader = (await cookies()).toString();
  const deck = await getDeck(summaryId, cookieHeader).catch(() => null);
  const examCards = deck?.cards.filter((c) => c.kind === 'exam') ?? [];

  return (
    <main className="bg-ink text-paper min-h-screen">
      <AppNav />
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-display mb-8 text-2xl">Self-test</h1>
        <SelfTestSession examCards={examCards} />
      </div>
    </main>
  );
}
