import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getSummary, getSummarySource, getDeckExportUrl } from '@/lib/api';
import { PreviewProvider } from '@/components/preview/PreviewContext';
import { HighlightToggle } from '@/components/preview/HighlightToggle';
import { HighlightScope } from '@/components/preview/HighlightScope';
import { SummaryPane } from '@/components/preview/SummaryPane';
import { SourcePane } from '@/components/preview/SourcePane';

export const metadata: Metadata = {
  title: 'Preview — StudySheet',
};

// Fetched server-side (not via useEffect) specifically so SummaryPane — a
// server component using M5's Visual/InlineMath — never needs to live
// inside client-component code that would drag their dependencies (mathjs,
// KaTeX) into the client bundle. Only SourcePane (pdf.js) and the small
// interactive bits (PageRefButton, HighlightToggle, HighlightScope) are
// client components; PreviewProvider is the client boundary that lets them
// share state with each other without either side importing the other.
export default async function PreviewPage({ params }: { params: Promise<{ summaryId: string }> }) {
  const { summaryId } = await params;

  // A Server Component's fetch has no ambient browser cookie jar (unlike a
  // Client Component's credentials: 'include') — the visiting browser's
  // session/anonymous-trial cookie has to be forwarded explicitly, or the
  // backend sees no identity at all and 404s (M8's ownership check).
  const cookieHeader = (await cookies()).toString();
  const summary = await getSummary(summaryId, cookieHeader).catch(() => null);
  const source = await getSummarySource(summaryId, cookieHeader).catch(() => null);

  if (!summary) {
    return (
      <main className="bg-ink text-paper flex min-h-screen items-center justify-center">
        <h1 className="font-display text-2xl">Couldn&apos;t load this summary.</h1>
      </main>
    );
  }

  return (
    <main className="bg-ink text-paper">
      <PreviewProvider>
        <div className="flex h-screen flex-col">
          <header className="border-edge flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
            <h1 className="font-display text-lg">Study sheet</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <Link href="/review" className="text-muted hover:text-paper">
                Review
              </Link>
              <Link href={`/self-test/${summaryId}`} className="text-muted hover:text-paper">
                Self-test
              </Link>
              {summary.deckId && (
                <span className="text-muted font-mono text-xs">
                  Export:{' '}
                  <a href={getDeckExportUrl(summary.deckId, 'anki-basic')} className="hover:text-teal underline">
                    Anki
                  </a>{' '}
                  ·{' '}
                  <a href={getDeckExportUrl(summary.deckId, 'quizlet')} className="hover:text-teal underline">
                    Quizlet
                  </a>
                </span>
              )}
              <HighlightToggle />
            </div>
          </header>
          <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
            <div className="overflow-y-auto">
              <HighlightScope>
                <SummaryPane summary={summary} />
              </HighlightScope>
            </div>
            <div className="border-edge overflow-hidden border-t md:border-t-0 md:border-l">
              {source ? (
                <SourcePane url={source.url} pageCount={source.pageCount} />
              ) : (
                <div className="text-muted flex h-full items-center justify-center p-6 text-center text-sm">
                  No source document available for this summary.
                </div>
              )}
            </div>
          </div>
        </div>
      </PreviewProvider>
    </main>
  );
}
