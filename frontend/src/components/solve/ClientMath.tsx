'use client';

import { useEffect, useState } from 'react';

// A client-side counterpart to lib/katex.ts's server helper — needed here
// because the solve result only exists after a client-side form submission
// (there's no data to server-render ahead of time the way the preview page
// has). Dynamically imported so katex only loads on this route, not
// landing/upload/etc. Its CSS is already loaded app-wide by
// (app)/layout.tsx (shared with the server-rendered InlineMath/DisplayMath).
export function ClientMath({ tex }: { tex: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('katex').then((katex) => {
      if (cancelled) return;
      try {
        setHtml(katex.default.renderToString(tex, { throwOnError: false, strict: 'ignore' }));
      } catch {
        setHtml(tex);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tex]);

  return <span dangerouslySetInnerHTML={{ __html: html ?? tex }} />;
}
