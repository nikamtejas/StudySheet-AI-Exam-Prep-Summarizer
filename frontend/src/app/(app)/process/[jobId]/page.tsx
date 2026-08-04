import type { Metadata } from 'next';
import { ProcessingView } from '@/components/process/ProcessingView';

export const metadata: Metadata = {
  title: 'Processing — StudySheet',
};

export default async function ProcessPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return (
    <main className="bg-ink text-paper min-h-screen">
      <ProcessingView jobId={jobId} />
    </main>
  );
}
