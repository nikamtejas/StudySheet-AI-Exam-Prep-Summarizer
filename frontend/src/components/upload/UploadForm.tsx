'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { presignUpload, registerDocument, createJob, ApiError } from '@/lib/api';
import type { Depth } from '@/contracts';

const MAX_FILES = 10;
// Rough per-page cost, docs/studysheet-build-prompt.md §12's own unit
// economics table — shown as a range since text-vs-vision isn't known until
// the backend probes the file after upload.
const COST_PER_PAGE_TYPED = 0.004;
const COST_PER_PAGE_VISION = 0.014;

interface FileEntry {
  file: File;
  pageCount: number | null;
  status: 'counting' | 'ready' | 'error';
}

function formatCost(dollars: number): string {
  return dollars < 0.01 ? '<$0.01' : `$${dollars.toFixed(2)}`;
}

export function UploadForm() {
  const router = useRouter();
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [depth, setDepth] = useState<Depth>('balanced');
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback((fileList: FileList) => {
    setFiles((prev) => {
      const room = MAX_FILES - prev.length;
      if (room <= 0) return prev;
      const incoming = Array.from(fileList)
        .filter((f) => f.type === 'application/pdf')
        .slice(0, room)
        .map((file): FileEntry => ({ file, pageCount: null, status: 'counting' }));

      for (const entry of incoming) {
        void import('@/lib/pdfPageCount').then(({ countPdfPages }) =>
          countPdfPages(entry.file)
            .then((count) => {
              setFiles((current) =>
                current.map((f) => (f.file === entry.file ? { ...f, pageCount: count, status: 'ready' } : f)),
              );
            })
            .catch(() => {
              setFiles((current) =>
                current.map((f) => (f.file === entry.file ? { ...f, status: 'error' } : f)),
              );
            }),
        );
      }

      return [...prev, ...incoming];
    });
  }, []);

  function removeFile(target: File) {
    setFiles((prev) => prev.filter((f) => f.file !== target));
  }

  const totalPages = files.reduce((sum, f) => sum + (f.pageCount ?? 0), 0);
  const allCounted = files.length > 0 && files.every((f) => f.status !== 'counting');
  const costLow = totalPages * COST_PER_PAGE_TYPED;
  const costHigh = totalPages * COST_PER_PAGE_VISION;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const documentIds: string[] = [];
      for (const entry of files) {
        const { uploadUrl, r2Key } = await presignUpload({
          filename: entry.file.name,
          contentType: 'application/pdf',
        });
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: entry.file,
          headers: { 'Content-Type': 'application/pdf' },
        });
        if (!putRes.ok) throw new Error(`Upload failed for ${entry.file.name}`);

        const { document } = await registerDocument({
          r2Key,
          filename: entry.file.name,
          sourceType: 'mixed',
          userId: 'anonymous',
        });
        documentIds.push(document.id);
      }

      const { jobId } = await createJob({ documentIds, depth, userId: 'anonymous' });
      router.push(`/process/${jobId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'queue_unavailable') {
        setError('The processing queue is unavailable right now. Try again in a moment.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-2xl">Upload your notes</h1>
      <p className="text-muted mt-2 text-base">
        Drop your notes here. PDFs, up to {MAX_FILES} at a time.
      </p>

      <label
        htmlFor={inputId}
        className={`border-edge mt-6 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-8 text-center transition-colors focus-within:ring-2 focus-within:ring-teal ${
          dragActive ? 'border-teal bg-surface' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
      >
        <span className="text-base">Drop PDFs here, or click to choose files</span>
        <span className="text-muted mt-1 text-sm">Typed, handwritten, or slides — up to {MAX_FILES} files</span>
        <input
          id={inputId}
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((entry) => (
            <li key={entry.file.name} className="border-edge flex items-center justify-between rounded-md border px-4 py-2">
              <span className="truncate text-sm">{entry.file.name}</span>
              <span className="flex items-center gap-3">
                <span className="text-muted font-mono text-xs">
                  {entry.status === 'counting' && 'counting pages…'}
                  {entry.status === 'ready' && `${entry.pageCount} pages`}
                  {entry.status === 'error' && "couldn't read this file"}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(entry.file)}
                  className="text-muted hover:text-paper rounded focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none"
                  aria-label={`Remove ${entry.file.name}`}
                >
                  &times;
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <fieldset className="border-edge mt-6 rounded-md border p-4">
        <legend className="px-1 text-sm font-semibold">Depth</legend>
        <div className="mt-2 flex gap-4">
          {(['crash', 'balanced', 'deep'] as const).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="depth"
                value={option}
                checked={depth === option}
                onChange={() => setDepth(option)}
                className="accent-amber"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>

      {files.length > 0 && allCounted && (
        <p className="text-muted mt-4 text-sm">
          {totalPages} page{totalPages === 1 ? '' : 's'} total — estimated cost {formatCost(costLow)}
          {costHigh > costLow ? ` to ${formatCost(costHigh)} if handwritten or scanned` : ''}.
        </p>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={files.length === 0 || !allCounted || submitting}
        className="bg-amber text-ink mt-6 w-full rounded-md px-6 py-3 text-base font-semibold transition-opacity focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none disabled:opacity-40"
      >
        {submitting ? 'Submitting…' : `Summarize ${files.length || ''} file${files.length === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}
