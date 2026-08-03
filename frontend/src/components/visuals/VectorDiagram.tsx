import type { VisualSpec, PointTuple } from '@/contracts';
import { arrowheadPoints, shortenTo } from './arrow';

type VectorDiagramSpec = Extract<VisualSpec, { kind: 'vectorDiagram' }>;

const WIDTH = 400;
const HEIGHT = 320;
const PAD = 36;

interface ScreenPoint {
  x: number;
  y: number;
}

function buildScreenScale(points: PointTuple[]): (p: PointTuple) => ScreenPoint {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const availW = WIDTH - PAD * 2;
  const availH = HEIGHT - PAD * 2;
  const scale = Math.min(availW / spanX, availH / spanY);
  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offsetX = PAD + (availW - drawW) / 2;
  const offsetY = PAD + (availH - drawH) / 2;
  return ([x, y]: PointTuple) => ({
    x: offsetX + (x - minX) * scale,
    y: offsetY + drawH - (y - minY) * scale,
  });
}

export function VectorDiagram({ spec }: { spec: VectorDiagramSpec }) {
  const { vectors, axes } = spec;
  if (vectors.length === 0) throw new Error('vectorDiagram: no vectors to render');

  const points: PointTuple[] = vectors.flatMap((v) => [v.from, v.to]);
  if (axes) points.push([0, 0]);
  const toScreen = buildScreenScale(points);
  const origin = toScreen([0, 0]);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Vector diagram">
      {axes && (
        <>
          <line x1={0} y1={origin.y} x2={WIDTH} y2={origin.y} className="stroke-edge" strokeWidth={1} />
          <line x1={origin.x} y1={0} x2={origin.x} y2={HEIGHT} className="stroke-edge" strokeWidth={1} />
        </>
      )}

      {vectors.map((v, i) => {
        const from = toScreen(v.from);
        const to = toScreen(v.to);
        const shortened = shortenTo(from, to, 7);
        return (
          <g key={i}>
            <line x1={from.x} y1={from.y} x2={shortened.x} y2={shortened.y} className="stroke-ink" strokeWidth={2} />
            <polygon points={arrowheadPoints(from, to, 8)} className="fill-ink" />
            {v.label && (
              <text
                x={(from.x + to.x) / 2 + 8}
                y={(from.y + to.y) / 2 - 8}
                fontSize={12}
                className="fill-ink"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {v.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
