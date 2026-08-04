const STEPS = [
  {
    n: '01',
    title: 'Upload',
    body: 'Drop your notes here. PDFs, up to 10 at a time — typed, handwritten, or slides.',
  },
  {
    n: '02',
    title: 'Read in the background',
    body: 'Every page gets read, chunked, and cross-checked. Watch the page count tick up in real time.',
  },
  {
    n: '03',
    title: 'Study from one sheet',
    body: 'Definitions, formulas, worked problems, and likely exam questions — highlighted, page-referenced, ready to print.',
  },
];

// Copy rules (docs/studysheet-build-prompt.md §9): sentence case, active
// voice, no exclamation marks.
export function HowItWorks() {
  return (
    <section className="border-edge mx-auto max-w-6xl border-t px-6 py-16 sm:py-20">
      <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.n}>
            <span className="text-muted font-mono text-sm">{step.n}</span>
            <h2 className="font-display mt-2 text-xl">{step.title}</h2>
            <p className="text-muted mt-2 text-base leading-relaxed">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
