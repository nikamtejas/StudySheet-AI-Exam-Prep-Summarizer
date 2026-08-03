import type { VisualSpec } from '@/contracts';

type CompareSpec = Extract<VisualSpec, { kind: 'compare' }>;

const CARD_W = 200;
const GAP = 20;
const PAD = 16;
const LINE_H = 20;
const TITLE_H = 28;
const AXES_H = 24;

export function Compare({ spec }: { spec: CompareSpec }) {
  const { left, right, axes } = spec;
  const maxPoints = Math.max(left.points.length, right.points.length, 1);
  const axesH = axes.length > 0 ? AXES_H : 0;
  const cardH = TITLE_H + maxPoints * LINE_H + PAD * 2;
  const width = CARD_W * 2 + GAP;
  const height = axesH + cardH;

  const renderCard = (side: CompareSpec['left'], x: number) => (
    <g>
      <rect
        x={x}
        y={axesH}
        width={CARD_W}
        height={cardH}
        fill="none"
        className="stroke-edge"
        strokeWidth={1.5}
      />
      <text
        x={x + CARD_W / 2}
        y={axesH + PAD + 14}
        textAnchor="middle"
        fontSize={13}
        fontWeight={700}
        className="fill-ink"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {side.title}
      </text>
      <line
        x1={x + PAD}
        y1={axesH + TITLE_H}
        x2={x + CARD_W - PAD}
        y2={axesH + TITLE_H}
        className="stroke-edge"
        strokeWidth={1}
      />
      {side.points.map((point, i) => (
        <text
          key={i}
          x={x + PAD}
          y={axesH + TITLE_H + PAD + i * LINE_H + 14}
          fontSize={11}
          className="fill-ink"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {'•'} {point}
        </text>
      ))}
    </g>
  );

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Comparison of ${left.title} and ${right.title}`}>
      {axes.length > 0 && (
        <text
          x={width / 2}
          y={16}
          textAnchor="middle"
          fontSize={10}
          className="fill-muted"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          Compared: {axes.join(', ')}
        </text>
      )}
      {renderCard(left, 0)}
      {renderCard(right, CARD_W + GAP)}
    </svg>
  );
}
