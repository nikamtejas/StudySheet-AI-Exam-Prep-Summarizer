import type { ReactElement } from 'react';
import { VisualSpecSchema, type VisualSpec } from '@/contracts';
import { FunctionPlot } from './FunctionPlot';
import { NumberLine } from './NumberLine';
import { Geometry } from './Geometry';
import { VectorDiagram } from './VectorDiagram';
import { Flowchart } from './Flowchart';
import { Tree } from './Tree';
import { Grid } from './Grid';
import { Timeline } from './Timeline';
import { Cycle } from './Cycle';
import { Compare } from './Compare';

// Components are invoked as plain functions here, never as JSX (`<Foo />`).
// JSX just builds a lazy element descriptor — the function body (and any
// throw inside it) doesn't actually run until React's renderer processes
// that descriptor later, which would be outside this try/catch. Calling
// them directly runs the body immediately, so a malformed spec's error
// surfaces right here instead of crashing the page it's embedded in.
function renderByKind(spec: VisualSpec): ReactElement {
  switch (spec.kind) {
    case 'functionPlot':
      return FunctionPlot({ spec });
    case 'numberLine':
      return NumberLine({ spec });
    case 'geometry':
      return Geometry({ spec });
    case 'vectorDiagram':
      return VectorDiagram({ spec });
    case 'flowchart':
      return Flowchart({ spec });
    case 'tree':
      return Tree({ spec });
    case 'grid':
      return Grid({ spec });
    case 'timeline':
      return Timeline({ spec });
    case 'cycle':
      return Cycle({ spec });
    case 'compare':
      return Compare({ spec });
  }
}

// The safe entry point: validates untrusted input against the schema, then
// renders with errors caught, so an invalid or pathological spec just drops
// the visual — the surrounding content (the rest of the solved-problem card,
// the page) still renders (docs/studysheet-milestones.md M5 "Done when").
export function Visual({ spec, caption }: { spec: unknown; caption?: string }) {
  const parsed = VisualSpecSchema.safeParse(spec);
  if (!parsed.success) return null;

  let element: ReactElement;
  try {
    element = renderByKind(parsed.data);
  } catch {
    return null;
  }

  return (
    <figure className="border-edge bg-paper text-ink rounded-md border p-3">
      {element}
      {caption && <figcaption className="text-muted mt-2 text-xs">{caption}</figcaption>}
    </figure>
  );
}
