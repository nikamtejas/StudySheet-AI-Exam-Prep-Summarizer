import type { VisualSpec } from '@/contracts';

type TimelineSpec = Extract<VisualSpec, { kind: 'timeline' }>;

const WIDTH = 480;
const ROW_H = 120;
const PAD = 40;
const LINE_Y = 60;

// Events are positioned evenly in the order given, not by parsing `at` as a
// date — `at` is often a non-numeric label ("Day 3", "Late Triassic") and
// guessing a parse would be its own source of malformed-input failures.
export function Timeline({ spec }: { spec: TimelineSpec }) {
  const { events } = spec;
  if (events.length === 0) throw new Error('timeline: no events to render');

  const step = events.length > 1 ? (WIDTH - PAD * 2) / (events.length - 1) : 0;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${ROW_H}`} role="img" aria-label="Timeline">
      <line x1={PAD} y1={LINE_Y} x2={WIDTH - PAD} y2={LINE_Y} className="stroke-ink" strokeWidth={2} />
      {events.map((event, i) => {
        const x = PAD + step * i;
        const above = i % 2 === 0;
        return (
          <g key={i}>
            <circle cx={x} cy={LINE_Y} r={5} className="fill-amber stroke-ink" strokeWidth={1} />
            <text
              x={x}
              y={above ? LINE_Y - 14 : LINE_Y + 24}
              textAnchor="middle"
              fontSize={11}
              fontFamily="ui-monospace, monospace"
              className="fill-ink"
            >
              {event.at}
            </text>
            <text
              x={x}
              y={above ? LINE_Y - 28 : LINE_Y + 38}
              textAnchor="middle"
              fontSize={10}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              className="fill-muted"
            >
              {event.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
