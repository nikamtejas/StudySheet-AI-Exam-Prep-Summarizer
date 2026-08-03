// Maps a value from [d0, d1] to [r0, r1] linearly. Used to convert spec
// "diagram space" coordinates into SVG viewBox pixel coordinates.
export function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1; // guards a degenerate zero-width domain rather than dividing by zero
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
}

export function niceTicks(domain: [number, number], targetCount = 5): number[] {
  const [d0, d1] = domain;
  if (!Number.isFinite(d0) || !Number.isFinite(d1) || d0 === d1) return [d0];
  const span = d1 - d0;
  const rawStep = span / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(rawStep)));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  const step = niceNormalized * magnitude;
  const start = Math.ceil(d0 / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= d1 + step * 1e-6; t += step) {
    ticks.push(Math.round(t / step) * step);
  }
  return ticks;
}

export function formatTick(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}
