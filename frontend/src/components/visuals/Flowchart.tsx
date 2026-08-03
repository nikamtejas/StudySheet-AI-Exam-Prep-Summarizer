import type { VisualSpec } from '@/contracts';
import { arrowheadPoints, shortenTo } from './arrow';

type FlowchartSpec = Extract<VisualSpec, { kind: 'flowchart' }>;

const NODE_W = 110;
const NODE_H = 44;
const ROW_GAP = 70;
const COL_GAP = 30;
const PAD = 24;

// Assigns each node a layer (row) via a longest-path-from-root pass. Bounded
// by a generous but finite step count so a cyclic graph (a malformed or
// deliberately-looping flowchart) degrades to a reasonable layout instead of
// hanging — docs/studysheet-milestones.md M5 "no runtime errors on malformed
// input".
function layoutLayers(nodes: FlowchartSpec['nodes'], edges: FlowchartSpec['edges']): Map<string, number> {
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const outgoing = new Map<string, string[]>(ids.map((id) => [id, []]));
  const incomingCount = new Map<string, number>(ids.map((id) => [id, 0]));

  for (const e of edges) {
    if (!idSet.has(e.from) || !idSet.has(e.to)) continue; // dangling reference — skip, don't throw
    outgoing.get(e.from)!.push(e.to);
    incomingCount.set(e.to, (incomingCount.get(e.to) ?? 0) + 1);
  }

  const layer = new Map<string, number>();
  const queue: string[] = ids.filter((id) => incomingCount.get(id) === 0);
  if (queue.length === 0 && ids.length > 0) queue.push(ids[0]!);
  for (const id of queue) layer.set(id, 0);

  const maxSteps = ids.length * ids.length + ids.length;
  let head = 0;
  let steps = 0;
  while (head < queue.length && steps < maxSteps) {
    const u = queue[head++]!;
    steps++;
    const uLayer = layer.get(u) ?? 0;
    for (const v of outgoing.get(u) ?? []) {
      const candidate = uLayer + 1;
      if (!layer.has(v) || candidate > layer.get(v)!) layer.set(v, candidate);
      if (!queue.includes(v)) queue.push(v);
    }
  }
  for (const id of ids) if (!layer.has(id)) layer.set(id, 0);
  return layer;
}

export function Flowchart({ spec }: { spec: FlowchartSpec }) {
  const { nodes, edges } = spec;
  if (nodes.length === 0) throw new Error('flowchart: no nodes to render');

  const layerOf = layoutLayers(nodes, edges);
  const rows = new Map<number, typeof nodes>();
  for (const node of nodes) {
    const l = layerOf.get(node.id) ?? 0;
    const row = rows.get(l) ?? [];
    row.push(node);
    rows.set(l, row);
  }
  const rowCount = rows.size;
  const maxRowWidth = Math.max(...[...rows.values()].map((row) => row.length * (NODE_W + COL_GAP) - COL_GAP));
  const width = maxRowWidth + PAD * 2;
  const height = rowCount * (NODE_H + ROW_GAP) - ROW_GAP + PAD * 2;

  const positions = new Map<string, { x: number; y: number }>();
  for (const [rowIndex, rowNodes] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const rowWidth = rowNodes.length * (NODE_W + COL_GAP) - COL_GAP;
    const startX = PAD + (maxRowWidth - rowWidth) / 2;
    rowNodes.forEach((node, i) => {
      positions.set(node.id, {
        x: startX + i * (NODE_W + COL_GAP),
        y: PAD + rowIndex * (NODE_H + ROW_GAP),
      });
    });
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Flowchart">
      {edges.map((edge, i) => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) return null;
        const start = { x: from.x + NODE_W / 2, y: from.y + NODE_H };
        const end = { x: to.x + NODE_W / 2, y: to.y };
        const shortened = shortenTo(start, end, 7);
        return (
          <g key={i}>
            <line
              x1={start.x}
              y1={start.y}
              x2={shortened.x}
              y2={shortened.y}
              className="stroke-ink"
              strokeWidth={1.5}
            />
            <polygon points={arrowheadPoints(start, end, 8)} className="fill-ink" />
            {edge.label && (
              <text
                x={(start.x + end.x) / 2 + 6}
                y={(start.y + end.y) / 2}
                fontSize={10}
                className="fill-muted"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {edge.label}
              </text>
            )}
          </g>
        );
      })}

      {nodes.map((node) => {
        const pos = positions.get(node.id);
        if (!pos) return null;
        const cx = pos.x + NODE_W / 2;
        const cy = pos.y + NODE_H / 2;
        return (
          <g key={node.id}>
            {node.shape === 'diamond' && (
              <polygon
                points={`${cx},${pos.y} ${pos.x + NODE_W},${cy} ${cx},${pos.y + NODE_H} ${pos.x},${cy}`}
                fill="none"
                className="stroke-ink"
                strokeWidth={2}
              />
            )}
            {node.shape === 'oval' && (
              <ellipse
                cx={cx}
                cy={cy}
                rx={NODE_W / 2}
                ry={NODE_H / 2}
                fill="none"
                className="stroke-ink"
                strokeWidth={2}
              />
            )}
            {node.shape === 'rect' && (
              <rect
                x={pos.x}
                y={pos.y}
                width={NODE_W}
                height={NODE_H}
                fill="none"
                className="stroke-ink"
                strokeWidth={2}
              />
            )}
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              fontSize={11}
              className="fill-ink"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
