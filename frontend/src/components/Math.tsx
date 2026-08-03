import { renderInlineMath, renderDisplayMath } from '@/lib/katex';

// Server components only — no "use client", no hooks. Must render identically
// inside a Puppeteer print pass with zero hydration (docs/studysheet-milestones.md M5).
export function InlineMath({ tex }: { tex: string }) {
  return <span dangerouslySetInnerHTML={{ __html: renderInlineMath(tex) }} />;
}

export function DisplayMath({ tex }: { tex: string }) {
  return <div dangerouslySetInnerHTML={{ __html: renderDisplayMath(tex) }} />;
}
