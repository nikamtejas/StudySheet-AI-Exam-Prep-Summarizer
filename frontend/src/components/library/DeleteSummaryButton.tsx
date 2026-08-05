'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteSummary } from '@/lib/api';

export function DeleteSummaryButton({ summaryId, filename }: { summaryId: string; filename: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Delete "${filename}" from your library? This can't be undone.`)) return;
    setDeleting(true);
    await deleteSummary(summaryId);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void handleDelete()}
      disabled={deleting}
      className="text-muted hover:text-paper text-sm focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none disabled:opacity-50"
    >
      {deleting ? 'Deleting…' : 'Delete'}
    </button>
  );
}
