import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import '../globals.css';

// A second, independent root layout — Next.js's documented "multiple root
// layouts" pattern (one <html>/<body> per top-level route group). The print
// route needs a completely separate document shell from the rest of the app
// (docs/studysheet-build-prompt.md §11: "the /print route must ship zero
// client JS ... any hydration there slows every PDF in the system") — it
// must never inherit app navigation, chrome, or client-side scripts that
// belong to the main site.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PrintRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
