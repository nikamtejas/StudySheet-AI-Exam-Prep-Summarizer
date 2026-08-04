import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { SummaryDTO } from '@/contracts';
import { FullStudySheet } from './FullStudySheet';
import { OnePager } from './OnePager';
import { AnswerAppendix } from './AnswerAppendix';
import './print.css';

// Unreachable from app navigation, noindex, excluded from the sitemap —
// docs/studysheet-milestones.md M6. This route's only two callers are the
// backend's Puppeteer service and a developer testing it directly.
export const metadata: Metadata = {
  title: 'StudySheet — print',
  robots: { index: false, follow: false },
};

type Variant = 'full' | 'onepager' | 'appendix';
type PageSize = 'a4' | 'letter';

function parseVariant(value: string | undefined): Variant {
  return value === 'onepager' || value === 'appendix' ? value : 'full';
}

function parseSize(value: string | undefined): PageSize {
  return value === 'letter' ? 'letter' : 'a4';
}

async function fetchSummaryForRender(summaryId: string, token: string): Promise<SummaryDTO | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  const res = await fetch(`${apiUrl}/api/render/${summaryId}?token=${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as SummaryDTO;
}

// Flips data-render-ready from "pending" to "true" once fonts have settled —
// the backend's Puppeteer service waits on this attribute rather than a
// fixed setTimeout (docs/studysheet-milestones.md M6). Today there's nothing
// genuinely async to wait for (server-rendered KaTeX, no external webfonts
// yet — those arrive in M7), so this resolves almost immediately; the
// mechanism is real and will keep working once M7 adds real fonts. A plain
// inline script, not a React client component — no hydration involved.
function RenderReadyScript() {
  const script = `document.fonts.ready.then(function () {
    document.querySelector('[data-render-ready]').setAttribute('data-render-ready', 'true');
  });`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ summaryId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { summaryId } = await params;
  const sp = await searchParams;

  const token = typeof sp.token === 'string' ? sp.token : '';
  const variant = parseVariant(typeof sp.variant === 'string' ? sp.variant : undefined);
  const size = parseSize(typeof sp.size === 'string' ? sp.size : undefined);
  const trimLevel = typeof sp.trimLevel === 'string' ? Number(sp.trimLevel) || 0 : 0;

  if (!token) notFound();

  const summary = await fetchSummaryForRender(summaryId, token);
  if (!summary) notFound();

  return (
    <div className={`print-root print-${size} print-variant-${variant}`} data-render-ready="pending">
      <RenderReadyScript />
      {variant === 'full' && <FullStudySheet summary={summary} />}
      {variant === 'onepager' && <OnePager summary={summary} trimLevel={trimLevel} />}
      {variant === 'appendix' && <AnswerAppendix summary={summary} />}
    </div>
  );
}
