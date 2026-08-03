import type { VisualSpec } from '@/contracts';

// Shared between the /dev/gallery preview route and the snapshot tests, so
// both exercise the exact same data.
export const sampleSpecs: Record<VisualSpec['kind'], VisualSpec> = {
  functionPlot: {
    kind: 'functionPlot',
    fns: ['x^2', 'x'],
    domain: [-3, 3],
    marks: [{ x: 1, y: 1 }],
    annotations: ['The curves cross at x=0 and x=1'],
  },
  numberLine: {
    kind: 'numberLine',
    range: [-5, 10],
    points: [2, 7],
    intervals: [[2, 7]],
  },
  geometry: {
    kind: 'geometry',
    shapes: [{ type: 'polygon', points: [[0, 0], [4, 0], [0, 3]] }],
    labels: [
      { text: 'A', at: [-0.3, -0.3] },
      { text: 'B', at: [4.3, -0.3] },
      { text: 'C', at: [-0.3, 3.3] },
    ],
    angles: [{ at: [0, 0], from: [4, 0], to: [0, 3], label: '90°' }],
    congruenceMarks: [],
  },
  vectorDiagram: {
    kind: 'vectorDiagram',
    vectors: [
      { from: [0, 0], to: [3, 2], label: 'a' },
      { from: [0, 0], to: [1, -2], label: 'b' },
    ],
    axes: true,
  },
  flowchart: {
    kind: 'flowchart',
    nodes: [
      { id: 'start', label: 'Start', shape: 'oval' },
      { id: 'check', label: 'x > 0?', shape: 'diamond' },
      { id: 'pos', label: 'Positive', shape: 'rect' },
      { id: 'neg', label: 'Non-positive', shape: 'rect' },
    ],
    edges: [
      { from: 'start', to: 'check' },
      { from: 'check', to: 'pos', label: 'yes' },
      { from: 'check', to: 'neg', label: 'no' },
    ],
  },
  tree: {
    kind: 'tree',
    root: {
      label: 'Root',
      children: [
        { label: 'Left', children: [{ label: 'LL', children: [] }, { label: 'LR', children: [] }] },
        { label: 'Right', children: [] },
      ],
    },
  },
  grid: {
    kind: 'grid',
    rows: [
      ['', 'A', 'B'],
      ['A', 'T', 'F'],
      ['B', 'F', 'T'],
    ],
    highlight: [[1, 1], [2, 2]],
  },
  timeline: {
    kind: 'timeline',
    events: [
      { at: '1687', label: "Newton's Principia" },
      { at: '1905', label: "Einstein's annus mirabilis" },
      { at: '1915', label: 'General relativity' },
    ],
  },
  cycle: {
    kind: 'cycle',
    stages: ['Glycolysis', 'Krebs cycle', 'Electron transport chain'],
  },
  compare: {
    kind: 'compare',
    left: { title: 'Mitosis', points: ['2 daughter cells', 'Genetically identical', 'Somatic cells'] },
    right: { title: 'Meiosis', points: ['4 daughter cells', 'Genetically distinct', 'Gametes'] },
    axes: ['Product count', 'Genetic variation', 'Cell type'],
  },
};
