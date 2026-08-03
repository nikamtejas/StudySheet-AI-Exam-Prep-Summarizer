import type { VisualSpec } from '@/contracts';
import { arrowheadPoints, shortenTo } from './arrow';

type CycleSpec = Extract<VisualSpec, { kind: 'cycle' }>;

const SIZE = 340;
const RADIUS = 130;
const STAGE_R = 34;

export function Cycle({ spec }: { spec: CycleSpec }) {
  const { stages } = spec;
  if (stages.length < 2) throw new Error('cycle: needs at least 2 stages to form a loop');

  const center = { x: SIZE / 2, y: SIZE / 2 };
  const positions = stages.map((_, i) => {
    // Start at the top, go clockwise — the conventional reading direction
    // for a labeled cycle diagram.
    const angle = -Math.PI / 2 + (i / stages.length) * 2 * Math.PI;
    return { x: center.x + RADIUS * Math.cos(angle), y: center.y + RADIUS * Math.sin(angle) };
  });

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Cycle diagram">
      {stages.map((_, i) => {
        const from = positions[i]!;
        const to = positions[(i + 1) % stages.length]!;
        // Draw the connecting arrow between the two circles' edges, not
        // their centers, so it doesn't run underneath the stage labels.
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const start = { x: from.x + ux * STAGE_R, y: from.y + uy * STAGE_R };
        const end = { x: to.x - ux * STAGE_R, y: to.y - uy * STAGE_R };
        const shortened = shortenTo(start, end, 7);
        return (
          <g key={`edge-${i}`}>
            <line x1={start.x} y1={start.y} x2={shortened.x} y2={shortened.y} className="stroke-ink" strokeWidth={1.5} />
            <polygon points={arrowheadPoints(start, end, 8)} className="fill-ink" />
          </g>
        );
      })}
      {stages.map((stage, i) => {
        const p = positions[i]!;
        return (
          <g key={`stage-${i}`}>
            <circle cx={p.x} cy={p.y} r={STAGE_R} className="fill-paper stroke-ink" strokeWidth={2} />
            <text
              x={p.x}
              y={p.y + 4}
              textAnchor="middle"
              fontSize={11}
              className="fill-ink"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {stage}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
