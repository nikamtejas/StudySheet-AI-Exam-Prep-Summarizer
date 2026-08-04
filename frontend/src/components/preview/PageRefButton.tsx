'use client';

import { usePreviewContext } from './PreviewContext';

// A small client "island" embedded inside the server-rendered SummaryPane —
// this direction (a Server Component importing a Client Component) is fine;
// it's the reverse (a Client Component importing Server Components like
// Visual/InlineMath, which pulls their server-only dependencies — mathjs,
// KaTeX — into the client bundle) that isn't. Confirmed the hard way: an
// earlier version of this page made PreviewView (a client component) import
// SummaryPane directly, and the preview route's first-load JS came out to
// ~393KB — mathjs and KaTeX had been dragged into the client bundle despite
// neither actually needing to run there.
export function PageRefButton({ page }: { page: number }) {
  const { jumpToPage } = usePreviewContext();
  return (
    <button
      type="button"
      onClick={() => jumpToPage(page)}
      className="text-muted hover:text-teal font-mono text-xs underline decoration-dotted focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none"
    >
      p.{page}
    </button>
  );
}
