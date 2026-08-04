'use client';

import { usePreviewContext } from './PreviewContext';

export function HighlightToggle() {
  const { highlightsVisible, toggleHighlights } = usePreviewContext();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={highlightsVisible} onChange={toggleHighlights} className="accent-amber" />
      Highlights
    </label>
  );
}
