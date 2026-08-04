'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface PreviewContextValue {
  activePage: number;
  jumpToPage: (page: number) => void;
  highlightsVisible: boolean;
  toggleHighlights: () => void;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

// The one piece of client state the preview needs, shared between two
// independently-composed subtrees: SummaryPane (kept a server component —
// see PageRefButton's comment for why) and SourcePane (a genuine client
// component, pdf.js needs the browser). A page.tsx-level composition
// (`<PreviewProvider><SummaryPane /><SourcePane /></PreviewProvider>`) lets
// a client provider wrap server-rendered content without either side
// needing to import the other.
export function PreviewProvider({ children }: { children: ReactNode }) {
  const [activePage, setActivePage] = useState(1);
  const [highlightsVisible, setHighlightsVisible] = useState(true);

  return (
    <PreviewContext.Provider
      value={{
        activePage,
        jumpToPage: setActivePage,
        highlightsVisible,
        toggleHighlights: () => setHighlightsVisible((v) => !v),
      }}
    >
      {children}
    </PreviewContext.Provider>
  );
}

export function usePreviewContext(): PreviewContextValue {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error('usePreviewContext must be used within a PreviewProvider');
  return ctx;
}
