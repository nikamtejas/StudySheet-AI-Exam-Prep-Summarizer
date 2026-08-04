import { MarkerHighlight } from './MarkerHighlight';

// "The hero IS the product — a live before/after, a scrappy scanned page on
// the left transforming into the marked-up summary on the right. No stat
// cards, no gradient orbs." (docs/studysheet-build-prompt.md §9). Built as a
// static two-panel mockup, not a real PDF render — this route must never
// load a PDF library (docs/studysheet-milestones.md M7).
function ScanLine({ width, indent = 0 }: { width: string; indent?: number }) {
  return (
    <div
      className="h-3 rounded-sm bg-[#c9c2aa]"
      style={{ width, marginLeft: `${indent}px` }}
      aria-hidden="true"
    />
  );
}

function BeforePanel() {
  return (
    <div
      className="flex h-full flex-col gap-3 rounded-sm bg-[#f3ecd8] p-6 shadow-2xl"
      style={{ transform: 'rotate(-1.5deg)' }}
      aria-hidden="true"
    >
      <ScanLine width="70%" />
      <ScanLine width="85%" />
      <ScanLine width="60%" />
      <ScanLine width="90%" indent={12} />
      <ScanLine width="55%" indent={12} />
      <div className="h-6" />
      <ScanLine width="80%" />
      <ScanLine width="65%" />
      <ScanLine width="88%" />
      <ScanLine width="40%" />
    </div>
  );
}

function AfterPanel() {
  return (
    <div className="bg-paper text-ink flex h-full flex-col gap-4 rounded-sm p-6 shadow-2xl">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg">Core concepts</h3>
        <span className="text-muted font-mono text-xs">p. 4-7</span>
      </div>
      <p className="text-sm leading-relaxed">
        <MarkerHighlight kind="definition">Inertia</MarkerHighlight> is the tendency of an object to
        resist changes in its state of motion — it takes a net force to speed up, slow down, or
        change direction.
      </p>
      <p className="text-sm leading-relaxed">
        Newton&apos;s second law states that{' '}
        <MarkerHighlight kind="exam-critical">force equals mass times acceleration</MarkerHighlight>,
        which is the relationship almost every problem in this chapter comes back to.
      </p>
      <div className="border-edge mt-auto border-t pt-3">
        <span className="text-muted font-mono text-xs">3 definitions · 2 formulas · 5 exam questions</span>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-16 pb-24 sm:pt-24">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-3xl sm:text-3xl">Turn your notes into a study sheet</h1>
        <p className="text-muted mt-4 text-lg">
          Upload lecture notes, scanned handwriting, or slides. Get a marked-up summary with worked
          problems, in minutes.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="/upload"
            className="bg-amber text-ink focus-visible:ring-teal rounded-md px-6 py-3 text-base font-semibold transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:outline-none"
          >
            Summarize your notes
          </a>
          <a
            href="/solve"
            className="border-edge text-paper hover:border-muted rounded-md border px-6 py-3 text-base font-semibold focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none"
          >
            Solve one problem
          </a>
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 items-center gap-8 sm:mt-20 sm:grid-cols-[1fr_auto_1fr]">
        <div className="aspect-[4/5]">
          <BeforePanel />
        </div>
        <div className="text-muted hidden font-mono text-sm sm:block" aria-hidden="true">
          &rarr;
        </div>
        <div className="aspect-[4/5]">
          <AfterPanel />
        </div>
      </div>
    </section>
  );
}
