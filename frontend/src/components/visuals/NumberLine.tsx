import type { VisualSpec } from '@/contracts';
import { scaleLinear, niceTicks, formatTick } from './scale';

type NumberLineSpec = Extract<VisualSpec, { kind: 'numberLine' }>;

const WIDTH = 480;
const HEIGHT = 120;
const PAD = 40;
const LINE_Y = 60;

export function NumberLine({ spec }: { spec: NumberLineSpec }) {
  const { range, points, intervals } = spec;
  if (range[0] === range[1]) throw new Error('numberLine: range has zero width');

  const scale = scaleLinear(range, [PAD, WIDTH - PAD]);
  const ticks = niceTicks(range);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Number line">
      <line x1={PAD} y1={LINE_Y} x2={WIDTH - PAD} y2={LINE_Y} className="stroke-ink" strokeWidth={2} />

      {ticks.map((t) => (
        <g key={`tick-${t}`}>
          <line x1={scale(t)} y1={LINE_Y - 5} x2={scale(t)} y2={LINE_Y + 5} className="stroke-edge" strokeWidth={1} />
          <text
            x={scale(t)}
            y={LINE_Y + 20}
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
            fontSize={10}
            className="fill-muted"
          >
            {formatTick(t)}
          </text>
        </g>
      ))}

      {/* Intervals drawn as a raised bar above the line — thickness alone
          reads correctly in greyscale, unlike a color-only highlight. */}
      {intervals.map(([a, b], i) => (
        <line
          key={`interval-${i}`}
          x1={scale(a)}
          y1={LINE_Y - 14}
          x2={scale(b)}
          y2={LINE_Y - 14}
          className="stroke-teal"
          strokeWidth={5}
          strokeLinecap="round"
        />
      ))}

      {points.map((p, i) => (
        <g key={`point-${i}`}>
          <circle cx={scale(p)} cy={LINE_Y} r={5} className="fill-amber stroke-ink" strokeWidth={1} />
        </g>
      ))}
    </svg>
  );
}
