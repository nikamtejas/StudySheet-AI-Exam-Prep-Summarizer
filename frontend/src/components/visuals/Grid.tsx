import type { VisualSpec } from '@/contracts';

type GridSpec = Extract<VisualSpec, { kind: 'grid' }>;

const CELL_W = 72;
const CELL_H = 36;

export function Grid({ spec }: { spec: GridSpec }) {
  const { rows, highlight } = spec;
  if (rows.length === 0) throw new Error('grid: no rows to render');

  const colCount = Math.max(...rows.map((r) => r.length));
  const width = colCount * CELL_W;
  const height = rows.length * CELL_H;
  const highlighted = new Set(highlight.map(([r, c]) => `${r},${c}`));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grid">
      {rows.map((row, r) =>
        Array.from({ length: colCount }, (_, c) => {
          const x = c * CELL_W;
          const y = r * CELL_H;
          const isHighlighted = highlighted.has(`${r},${c}`);
          return (
            <g key={`${r}-${c}`}>
              {isHighlighted && <rect x={x} y={y} width={CELL_W} height={CELL_H} className="fill-amber" opacity={0.35} />}
              <rect
                x={x}
                y={y}
                width={CELL_W}
                height={CELL_H}
                fill="none"
                className="stroke-edge"
                strokeWidth={isHighlighted ? 2 : 1}
              />
              <text
                x={x + CELL_W / 2}
                y={y + CELL_H / 2 + 4}
                textAnchor="middle"
                fontSize={12}
                className="fill-ink"
                fontFamily="ui-monospace, monospace"
              >
                {row[c] ?? ''}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}
