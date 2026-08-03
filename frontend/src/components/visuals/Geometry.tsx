import type { VisualSpec, PointTuple } from '@/contracts';

type GeometrySpec = Extract<VisualSpec, { kind: 'geometry' }>;

const WIDTH = 400;
const HEIGHT = 320;
const PAD = 36;

interface ScreenPoint {
  x: number;
  y: number;
}

// Diagram-space coordinates follow standard math convention (y increases
// upward), like the other primitives — this flips it for SVG (y down) while
// fitting everything into the viewBox uniformly (no stretching).
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

function arcPath(center: ScreenPoint, radius: number, from: ScreenPoint, to: ScreenPoint): string {
  const a1 = Math.atan2(from.y - center.y, from.x - center.x);
  const a2 = Math.atan2(to.y - center.y, to.x - center.x);
  let delta = a2 - a1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const start = { x: center.x + radius * Math.cos(a1), y: center.y + radius * Math.sin(a1) };
  const end = { x: center.x + radius * Math.cos(a1 + delta), y: center.y + radius * Math.sin(a1 + delta) };
  const sweep = delta > 0 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 ${sweep} ${end.x} ${end.y}`;
}

function congruenceTickLines(from: ScreenPoint, to: ScreenPoint, count: number) {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const tickLen = 6;
  const spacing = 4;
  return Array.from({ length: count }, (_, i) => {
    const offset = (i - (count - 1) / 2) * spacing;
    const cx = mid.x + ux * offset;
    const cy = mid.y + uy * offset;
    return { x1: cx - px * tickLen, y1: cy - py * tickLen, x2: cx + px * tickLen, y2: cy + py * tickLen };
  });
}

export function Geometry({ spec }: { spec: GeometrySpec }) {
  const { shapes, labels, angles, congruenceMarks } = spec;

  const allPoints: PointTuple[] = [
    ...shapes.flatMap((s) =>
      s.type === 'polygon' ? s.points : s.type === 'circle' ? [s.center] : [s.from, s.to],
    ),
    ...labels.map((l) => l.at),
    ...angles.flatMap((a) => [a.at, a.from, a.to]),
    ...congruenceMarks.flatMap((c) => [c.from, c.to]),
  ];
  if (allPoints.length === 0) throw new Error('geometry: spec has no points to render');

  const toScreen = buildScreenScale(allPoints);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Geometry diagram">
      {shapes.map((shape, i) => {
        if (shape.type === 'polygon') {
          const pts = shape.points.map((p) => toScreen(p));
          return (
            <polygon
              key={i}
              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              className="stroke-ink"
              strokeWidth={2}
            />
          );
        }
        if (shape.type === 'circle') {
          const c = toScreen(shape.center);
          const edge = toScreen([shape.center[0] + shape.radius, shape.center[1]]);
          const r = Math.hypot(edge.x - c.x, edge.y - c.y);
          return <circle key={i} cx={c.x} cy={c.y} r={r} fill="none" className="stroke-ink" strokeWidth={2} />;
        }
        const from = toScreen(shape.from);
        const to = toScreen(shape.to);
        return (
          <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="stroke-ink" strokeWidth={2} />
        );
      })}

      {angles.map((angle, i) => {
        const at = toScreen(angle.at);
        const from = toScreen(angle.from);
        const to = toScreen(angle.to);
        const path = arcPath(at, 18, from, to);
        return (
          <g key={`angle-${i}`}>
            <path d={path} fill="none" className="stroke-teal" strokeWidth={1.5} />
            {angle.label && (
              <text
                x={at.x + 24}
                y={at.y + 4}
                fontSize={10}
                className="fill-muted"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {angle.label}
              </text>
            )}
          </g>
        );
      })}

      {congruenceMarks.map((mark, i) => {
        const from = toScreen(mark.from);
        const to = toScreen(mark.to);
        return congruenceTickLines(from, to, mark.ticks).map((tick, j) => (
          <line
            key={`cm-${i}-${j}`}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            className="stroke-ink"
            strokeWidth={1.5}
          />
        ));
      })}

      {labels.map((label, i) => {
        const at = toScreen(label.at);
        return (
          <text
            key={`label-${i}`}
            x={at.x}
            y={at.y}
            fontSize={12}
            textAnchor="middle"
            className="fill-ink"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {label.text}
          </text>
        );
      })}
    </svg>
  );
}
