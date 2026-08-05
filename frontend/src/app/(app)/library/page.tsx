import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getLibrary } from '@/lib/api';
import { AppNav } from '@/components/nav/AppNav';
import { DeleteSummaryButton } from '@/components/library/DeleteSummaryButton';

export const metadata: Metadata = {
  title: 'Library — StudySheet',
};

const PAGE_SIZE = 20;

// docs/studysheet-milestones.md M8: "Library: paginated past summaries,
// re-download, delete." An anonymous identity can load this too (its own
// trial summaries, until the 24h TTL takes them) — there's no hard sign-in
// wall anywhere in the app, matching §12's free-tier design ("they get the
// artifact; they subscribe for the semester").
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number(pageParam ?? 0) || 0);

  const cookieHeader = (await cookies()).toString();
  const library = await getLibrary(page, PAGE_SIZE, cookieHeader).catch(() => null);

  return (
    <main className="bg-ink text-paper min-h-screen">
      <AppNav />
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-2xl">Your library</h1>

        {!library || library.items.length === 0 ? (
          <p className="text-muted mt-6 text-base">
            Nothing here yet. <Link href="/upload" className="text-teal underline">Summarize your first PDF</Link>.
          </p>
        ) : (
          <ul className="border-edge mt-8 divide-y divide-[var(--color-edge)] border-t">
            {library.items.map((item) => (
              <li key={item.summaryId} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <Link href={`/preview/${item.summaryId}`} className="hover:text-teal text-base font-semibold">
                    {item.filename}
                  </Link>
                  <p className="text-muted font-mono text-xs">
                    {item.pageCount} page{item.pageCount === 1 ? '' : 's'} ·{' '}
                    {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <DeleteSummaryButton summaryId={item.summaryId} filename={item.filename} />
              </li>
            ))}
          </ul>
        )}

        {library && library.total > PAGE_SIZE && (
          <div className="mt-8 flex items-center justify-between text-sm">
            <Link
              href={`/library?page=${Math.max(0, page - 1)}`}
              aria-disabled={page === 0}
              className={page === 0 ? 'text-muted pointer-events-none opacity-40' : 'hover:text-teal'}
            >
              &larr; Newer
            </Link>
            <Link
              href={`/library?page=${page + 1}`}
              aria-disabled={(page + 1) * PAGE_SIZE >= library.total}
              className={
                (page + 1) * PAGE_SIZE >= library.total ? 'text-muted pointer-events-none opacity-40' : 'hover:text-teal'
              }
            >
              Older &rarr;
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
