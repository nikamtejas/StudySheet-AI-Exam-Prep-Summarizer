import { evaluate } from 'mathjs';
import type { VisualSpec } from '@/contracts';
import { scaleLinear, niceTicks, formatTick } from './scale';

type FunctionPlotSpec = Extract<VisualSpec, { kind: 'functionPlot' }>;

const WIDTH = 480;
const HEIGHT = 320;
const PAD = 40;
const SAMPLES = 200;
// Different dash patterns per function so multiple curves stay
// distinguishable without relying on color (docs/studysheet-milestones.md
// M5: "legible printed in greyscale").
const DASH_PATTERNS = [undefined, '6 4', '2 3', '10 4 2 4'];

function sampleFn(fn: string, domain: [number, number]): Array<[number, number]> {
  const [x0, x1] = domain;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const x = x0 + ((x1 - x0) * i) / SAMPLES;
    const y = evaluate(fn, { x });
    if (typeof y === 'number' && Number.isFinite(y)) {
      points.push([x, y]);
    }
  }
  return points;
}

export function FunctionPlot({ spec }: { spec: FunctionPlotSpec }) {
  const { fns, domain, marks, annotations } = spec;
  if (domain[0] === domain[1]) throw new Error('functionPlot: domain has zero width');

  const sampled = fns.map((fn) => sampleFn(fn, domain));
  const allY = sampled.flatMap((pts) => pts.map(([, y]) => y));
  if (allY.length === 0) throw new Error('functionPlot: no function evaluated to a finite value');

  const yMin = Math.min(...allY, ...marks.map((m) => m.y));
  const yMax = Math.max(...allY, ...marks.map((m) => m.y));
  const yPad = (yMax - yMin || 1) * 0.1;
  const yDomain: [number, number] = [yMin - yPad, yMax + yPad];

  const xScale = scaleLinear(domain, [PAD, WIDTH - PAD]);
  const yScale = scaleLinear(yDomain, [HEIGHT - PAD, PAD]);

  const xTicks = niceTicks(domain);
  const yTicks = niceTicks(yDomain);
  const xAxisY = yDomain[0] <= 0 && yDomain[1] >= 0 ? yScale(0) : HEIGHT - PAD;
  const yAxisX = domain[0] <= 0 && domain[1] >= 0 ? xScale(0) : PAD;

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Plot of ${fns.join(', ')}`}>
        {/* axes */}
        <line x1={PAD} y1={xAxisY} x2={WIDTH - PAD} y2={xAxisY} className="stroke-edge" strokeWidth={1.5} />
        <line x1={yAxisX} y1={PAD} x2={yAxisX} y2={HEIGHT - PAD} className="stroke-edge" strokeWidth={1.5} />

        {xTicks.map((t) => (
          <g key={`xt-${t}`}>
            <line x1={xScale(t)} y1={xAxisY - 3} x2={xScale(t)} y2={xAxisY + 3} className="stroke-edge" strokeWidth={1} />
            <text x={xScale(t)} y={xAxisY + 14} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={9} className="fill-muted">
              {formatTick(t)}
            </text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`yt-${t}`}>
            <line x1={yAxisX - 3} y1={yScale(t)} x2={yAxisX + 3} y2={yScale(t)} className="stroke-edge" strokeWidth={1} />
            <text x={yAxisX - 6} y={yScale(t) + 3} textAnchor="end" fontFamily="ui-monospace, monospace" fontSize={9} className="fill-muted">
              {formatTick(t)}
            </text>
          </g>
        ))}

        {sampled.map((points, i) => (
          <path
            key={`fn-${i}`}
            d={points.map(([x, y], j) => `${j === 0 ? 'M' : 'L'} ${xScale(x)} ${yScale(y)}`).join(' ')}
            fill="none"
            className="stroke-ink"
            strokeWidth={2}
            strokeDasharray={DASH_PATTERNS[i % DASH_PATTERNS.length]}
          />
        ))}

        {marks.map((mark, i) => (
          <g key={`mark-${i}`}>
            <circle cx={xScale(mark.x)} cy={yScale(mark.y)} r={4} className="fill-amber" />
          </g>
        ))}
      </svg>
      {annotations.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm">
          {annotations.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
