import katex from 'katex';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderSafely(tex: string, displayMode: boolean): string {
  try {
    // throwOnError: false already turns most malformed TeX into an inline
    // error span instead of throwing — the catch below is the last resort
    // for the rare input that still throws, so one bad expression never
    // takes down the whole page render (docs/studysheet-milestones.md M5:
    // "no runtime errors on malformed input").
    return katex.renderToString(tex, { displayMode, throwOnError: false, strict: 'ignore' });
  } catch {
    return escapeHtml(tex);
  }
}

// Server-side KaTeX rendering — no DOM, safe to call during RSC render or a
// Puppeteer-driven print pass. Returns markup for `dangerouslySetInnerHTML`;
// KaTeX's own output is what's trusted here, not arbitrary caller HTML.
export function renderInlineMath(tex: string): string {
  return renderSafely(tex, false);
}

export function renderDisplayMath(tex: string): string {
  return renderSafely(tex, true);
}
