import type { VisualSpec, TreeNode } from '@/contracts';

type TreeSpec = Extract<VisualSpec, { kind: 'tree' }>;

const NODE_R = 18;
const SLOT_W = 70;
const ROW_H = 70;
const PAD = 30;
const MAX_DEPTH = 12; // safety bound — treats anything deeper as a leaf rather than recursing unboundedly

interface LaidOutNode {
  label: string;
  x: number;
  y: number;
  children: LaidOutNode[];
}

function layoutTree(root: TreeNode): { laid: LaidOutNode; leafCount: number; maxDepth: number } {
  let nextLeafX = 0;
  let maxDepth = 0;

  function visit(node: TreeNode, depth: number): LaidOutNode {
    maxDepth = Math.max(maxDepth, depth);
    const children = depth >= MAX_DEPTH ? [] : node.children;
    if (children.length === 0) {
      const x = nextLeafX;
      nextLeafX += 1;
      return { label: node.label, x, y: depth, children: [] };
    }
    const laidChildren = children.map((c) => visit(c, depth + 1));
    const x = laidChildren.reduce((sum, c) => sum + c.x, 0) / laidChildren.length;
    return { label: node.label, x, y: depth, children: laidChildren };
  }

  const laid = visit(root, 0);
  return { laid, leafCount: Math.max(nextLeafX, 1), maxDepth };
}

function flatten(node: LaidOutNode): LaidOutNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

export function Tree({ spec }: { spec: TreeSpec }) {
  const { laid, leafCount, maxDepth } = layoutTree(spec.root);
  const width = leafCount * SLOT_W + PAD * 2;
  const height = (maxDepth + 1) * ROW_H + PAD * 2;

  const toScreen = (n: LaidOutNode) => ({ x: PAD + n.x * SLOT_W + SLOT_W / 2, y: PAD + n.y * ROW_H + NODE_R });

  const nodes = flatten(laid);
  const edges = nodes.flatMap((n) => n.children.map((c) => ({ from: n, to: c })));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tree diagram">
      {edges.map((edge, i) => {
        const from = toScreen(edge.from);
        const to = toScreen(edge.to);
        return (
          <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="stroke-ink" strokeWidth={1.5} />
        );
      })}
      {nodes.map((n, i) => {
        const p = toScreen(n);
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={NODE_R} className="fill-paper stroke-ink" strokeWidth={2} />
            <text
              x={p.x}
              y={p.y + 4}
              textAnchor="middle"
              fontSize={11}
              className="fill-ink"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
