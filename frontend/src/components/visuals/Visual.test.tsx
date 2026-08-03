import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Visual } from './Visual';
import { sampleSpecs } from './sampleSpecs';

// renderToStaticMarkup produces plain, non-interactive HTML with no
// hydration markers — these components are server-only by construction
// (no "use client", no hooks), so this is already the same output a
// Puppeteer print pass or a JS-disabled browser would see.
describe('Visual — all ten primitives render from spec', () => {
  for (const [kind, spec] of Object.entries(sampleSpecs)) {
    it(`renders ${kind} deterministically`, () => {
      const html = renderToStaticMarkup(<Visual spec={spec} caption={kind} />);
      expect(html.length).toBeGreaterThan(0);
      expect(html).toMatchSnapshot();

      // Same spec in, byte-identical markup out — no dependence on Date.now,
      // Math.random, or anything else non-deterministic (a prerequisite for
      // "identical SVG output from the web and PDF paths").
      const secondRender = renderToStaticMarkup(<Visual spec={spec} caption={kind} />);
      expect(secondRender).toBe(html);
    });
  }
});

describe('Visual — malformed input never crashes the surrounding render', () => {
  const cases: Array<[string, unknown]> = [
    ['a spec with an unrecognized kind', { kind: 'not-a-real-kind' }],
    ['null', null],
    ['undefined', undefined],
    ['a functionPlot with a zero-width domain (valid schema, broken renderer input)', {
      kind: 'functionPlot',
      fns: ['x'],
      domain: [1, 1],
      marks: [],
      annotations: [],
    }],
    ['a cycle with fewer than 2 stages (valid schema, broken renderer input)', {
      kind: 'cycle',
      stages: ['only one'],
    }],
  ];

  for (const [label, spec] of cases) {
    it(`drops the visual instead of throwing for ${label}`, () => {
      expect(() => renderToStaticMarkup(<Visual spec={spec} />)).not.toThrow();
      const html = renderToStaticMarkup(<Visual spec={spec} />);
      expect(html).toBe('');
    });
  }

  it('renders surrounding content even when a visual embedded alongside it is malformed', () => {
    const html = renderToStaticMarkup(
      <div>
        <span>before</span>
        <Visual spec={{ kind: 'not-a-real-kind' }} />
        <span>after</span>
      </div>,
    );
    expect(html).toContain('before');
    expect(html).toContain('after');
  });
});
