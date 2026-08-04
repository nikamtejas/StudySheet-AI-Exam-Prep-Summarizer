'use client';

import type { ReactNode } from 'react';
import { usePreviewContext } from './PreviewContext';

// Wraps the (server-rendered) summary content and stamps a data-attribute
// CSS reads to show/hide highlight marks (globals.css: `[data-highlights="off"]
// mark`) — the toggle is purely a CSS effect on marks SummaryPane always
// renders, so SummaryPane itself never needs to know about the client-side
// toggle state.
export function HighlightScope({ children }: { children: ReactNode }) {
  const { highlightsVisible } = usePreviewContext();
  return <div data-highlights={highlightsVisible ? 'on' : 'off'}>{children}</div>;
}
