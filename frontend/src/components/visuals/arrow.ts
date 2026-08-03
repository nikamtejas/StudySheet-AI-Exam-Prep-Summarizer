interface ScreenPoint {
  x: number;
  y: number;
}

// Computes an arrowhead triangle's points directly, rather than an SVG
// <marker> def — marker ids are shared per-document, so two instances of the
// same component (e.g. two flowcharts on one page) would collide on a static
// id. Inline polygons need no id at all.
export function arrowheadPoints(from: ScreenPoint, to: ScreenPoint, size = 7): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const backX = to.x - ux * size;
  const backY = to.y - uy * size;
  const p1 = { x: backX + px * (size / 2), y: backY + py * (size / 2) };
  const p2 = { x: backX - px * (size / 2), y: backY - py * (size / 2) };
  return `${to.x},${to.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`;
}

// The line should stop short of the true tip so the arrowhead polygon isn't
// drawn over by the line's own stroke width.
export function shortenTo(from: ScreenPoint, to: ScreenPoint, by: number): ScreenPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: to.x - (dx / len) * by, y: to.y - (dy / len) * by };
}
