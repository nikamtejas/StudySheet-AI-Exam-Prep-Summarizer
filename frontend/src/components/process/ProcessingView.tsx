'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { streamJob, type JobProgressEvent, type JobDoneEvent } from '@/lib/api';

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  preparing: 'Reading pages',
  chunking: 'Splitting into sections',
  mapping: 'Extracting definitions and problems',
  reducing: 'Merging results',
  solving: 'Solving problems',
  synthesizing: 'Writing your study sheet',
  done: 'Done',
  failed: 'Failed',
};

// The filmstrip lights up blocks as real, persisted progress advances
// (job.chunkResults.length + problemResults.length vs the known total) —
// "honest progress, not a fake bar" (docs/studysheet-build-prompt.md §9).
// It isn't literal source-page thumbnails (that would need a new backend
// endpoint serving rasterized pages for display, which doesn't exist yet) —
// each block represents one unit of checkpointed work, not one page.
function Filmstrip({ done, total }: { done: number; total: number }) {
  const blockCount = Math.max(total, 1);
  return (
    <div className="flex flex-wrap gap-1" role="img" aria-label={`${done} of ${total} done`}>
      {Array.from({ length: blockCount }, (_, i) => (
        <div
          key={i}
          className={`h-8 w-6 rounded-sm transition-colors duration-300 ${i < done ? 'bg-amber' : 'bg-surface border-edge border'}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function ProcessingView({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<JobProgressEvent | null>(null);
  const [done, setDone] = useState<JobDoneEvent | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const unsubscribe = streamJob(jobId, {
      onProgress: (event) => {
        setReconnecting(false);
        setProgress(event);
      },
      onDone: (event) => setDone(event),
      onConnectionError: () => {
        // EventSource retries on its own, but flag it in the UI so a real
        // 30-second drop reads as "reconnecting", not silently stuck
        // (docs/studysheet-milestones.md M7: "SSE survives a 30-second
        // network drop ... resumes without duplicate sections").
        setReconnecting(true);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [jobId]);

  useEffect(() => {
    if (done?.status === 'completed' && done.summaryId) {
      router.push(`/preview/${done.summaryId}`);
    }
  }, [done, router]);

  if (done?.status === 'failed') {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <h1 className="font-display text-2xl">This didn&apos;t work</h1>
        <p className="text-muted mt-3 text-base">
          {done.error ?? 'Something went wrong while processing your document.'}
        </p>
        <a
          href="/upload"
          className="bg-amber text-ink mt-6 inline-block rounded-md px-6 py-3 text-base font-semibold focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none"
        >
          Try again
        </a>
      </div>
    );
  }

  const stageLabel = progress ? (STAGE_LABELS[progress.stage] ?? progress.stage) : 'Connecting…';
  const doneCount = progress?.progress.done ?? 0;
  const totalCount = progress?.progress.total ?? 0;

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-2xl">{stageLabel}</h1>
      {reconnecting && (
        <p className="mt-2 text-sm text-amber" role="status">
          Reconnecting…
        </p>
      )}
      <p className="text-muted font-mono mt-2 text-sm" aria-live="polite">
        {totalCount > 0 ? `${doneCount} / ${totalCount}` : 'starting…'}
      </p>
      <div className="mt-6">
        <Filmstrip done={doneCount} total={totalCount} />
      </div>
    </div>
  );
}
