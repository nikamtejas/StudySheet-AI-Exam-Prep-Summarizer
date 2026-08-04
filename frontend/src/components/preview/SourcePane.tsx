'use client';

import { useEffect, useRef, useState } from 'react';
import { usePreviewContext } from './PreviewContext';

// pdfjs-dist's own type declarations don't export a PDFDocumentProxy path
// that's convenient to import standalone here — using the loaded module's
// inferred type keeps this in sync with whatever version is installed
// without hand-maintaining a parallel type.
type PdfDocument = Awaited<ReturnType<typeof loadPdf>>;

async function loadPdf(url: string) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  return pdfjsLib.getDocument(url).promise;
}

// Source pane of the two-pane preview (docs/studysheet-milestones.md M7).
// pdf.js only loads here, never on landing/upload — dynamic import keeps it
// out of this route's own first-load JS too, matching the upload page's
// pattern for page counting. Reads/drives the shared `activePage` from
// PreviewContext rather than a prop, since page-ref buttons live inside the
// server-rendered SummaryPane, an entirely separate subtree.
// Cap render scale so desktop windows don't pay for canvas resolution far
// beyond what's ever visible — the container-width fit below still governs
// small screens, this only bounds the top end.
const MAX_RENDER_SCALE = 1.5;

export function SourcePane({ url, pageCount }: { url: string; pageCount: number }) {
  const { activePage, jumpToPage } = usePreviewContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadPdf(url)
      .then((doc) => {
        if (!cancelled) setPdfDoc(doc);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load the source PDF.");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // A fixed render scale made the canvas wider than the pane on narrow
  // viewports (docs/studysheet-milestones.md M7: "full flow works at 375px
  // width") — the pane's own overflow-auto kept that from breaking the page
  // as a whole, but left the source pane itself unusable without horizontal
  // scrolling just to see one page. Measuring the container and rendering at
  // a scale that fits its width fixes that, and also means the canvas
  // reflows on window resize instead of staying pinned to whatever width was
  // current on first render.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !containerWidth) return;
    let cancelled = false;
    void (async () => {
      const page = await pdfDoc.getPage(activePage);
      if (cancelled) return;
      const unscaledWidth = page.getViewport({ scale: 1 }).width;
      const scale = Math.min(containerWidth / unscaledWidth, MAX_RENDER_SCALE);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, activePage, containerWidth]);

  if (loadError) {
    return <p className="text-muted p-4 text-sm">{loadError}</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-edge flex items-center justify-between border-b px-4 py-2">
        <button
          type="button"
          onClick={() => jumpToPage(Math.max(1, activePage - 1))}
          disabled={activePage <= 1}
          className="text-sm disabled:opacity-30"
        >
          &larr; Prev
        </button>
        <span className="font-mono text-sm">
          {activePage} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => jumpToPage(Math.min(pageCount, activePage + 1))}
          disabled={activePage >= pageCount}
          className="text-sm disabled:opacity-30"
        >
          Next &rarr;
        </button>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto p-4">
        {!pdfDoc ? (
          <p className="text-muted text-sm">Loading source…</p>
        ) : (
          <canvas ref={canvasRef} className="mx-auto shadow-lg" />
        )}
      </div>
    </div>
  );
}
