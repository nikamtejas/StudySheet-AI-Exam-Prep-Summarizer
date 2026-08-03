import type { Metadata } from 'next';
import { Visual } from '@/components/visuals';
import { sampleSpecs } from '@/components/visuals/sampleSpecs';
import { InlineMath, DisplayMath } from '@/components/Math';

// Dev-only preview — not linked from app navigation, and excluded from
// indexing below. Proves all ten primitives render from spec, in both
// normal and greyscale presentations (docs/studysheet-milestones.md M5).
export const metadata: Metadata = {
  title: 'Visual primitives gallery (dev)',
  robots: { index: false, follow: false },
};

const LABELS: Record<keyof typeof sampleSpecs, string> = {
  functionPlot: 'functionPlot',
  numberLine: 'numberLine',
  geometry: 'geometry',
  vectorDiagram: 'vectorDiagram',
  flowchart: 'flowchart',
  tree: 'tree',
  grid: 'grid',
  timeline: 'timeline',
  cycle: 'cycle',
  compare: 'compare',
};

function PrimitiveGrid() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {Object.entries(sampleSpecs).map(([kind, spec]) => (
        <Visual key={kind} spec={spec} caption={LABELS[kind as keyof typeof sampleSpecs]} />
      ))}
    </div>
  );
}

// A spec that fails schema validation entirely, and one that parses but
// breaks a renderer's own invariant (zero-width domain) — both must drop
// silently rather than take the whole page down with them.
const malformedSpecs: unknown[] = [
  { kind: 'functionPlot', fns: ['x'], domain: [1, 1] },
  { kind: 'not-a-real-kind', whatever: true },
  null,
];

export default function GalleryPage() {
  return (
    <main className="bg-ink text-paper min-h-screen p-8">
      <h1 className="mb-2 text-2xl font-semibold">Visual primitives gallery</h1>
      <p className="text-muted mb-8 text-sm">
        Sample data for all ten primitives from docs/studysheet-build-prompt.md §4, plus the KaTeX
        helper and a malformed-input check. Dev-only — never linked from app navigation.
      </p>

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-medium">Normal</h2>
        <PrimitiveGrid />
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-medium">Greyscale preview</h2>
        <p className="text-muted mb-4 text-sm">
          Every primitive must stay legible with color removed — meaning encoded in weight and
          dash, not only color.
        </p>
        <div style={{ filter: 'grayscale(1)' }}>
          <PrimitiveGrid />
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-medium">Print preview</h2>
        <p className="text-muted mb-4 text-sm">
          On the paper surface the print path actually renders against — ink strokes on paper, no
          dark background.
        </p>
        <div className="bg-paper rounded-md p-6">
          <div className="text-ink [&_figure]:border-edge">
            <PrimitiveGrid />
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-medium">KaTeX (server-rendered)</h2>
        <p className="mb-2 text-sm">
          Inline: the quadratic formula is <InlineMath tex="x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}" />.
        </p>
        <DisplayMath tex="\int_0^1 x^2\,dx = \frac{1}{3}" />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">Malformed input (should render nothing, not crash)</h2>
        <div className="flex gap-4">
          {malformedSpecs.map((spec, i) => (
            <Visual key={i} spec={spec} />
          ))}
          <span className="text-muted text-sm">
            ({malformedSpecs.length} malformed specs above — all should be invisible, page still
            intact)
          </span>
        </div>
      </section>
    </main>
  );
}
