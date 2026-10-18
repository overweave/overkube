/*
 * A line through points, drawn smooth: what the kit's charts share. A long
 * line is first made calm (each bucket of it its mean), then drawn as
 * curves through the points' midpoints, each point a curve's control — so
 * it passes near every point and turns nowhere sharp.
 */

/** At most so many points: each its bucket's mean (a short line as it is). */
export function calm(points: readonly number[], at: number): number[] {
  if (points.length <= at) return [...points];
  const size = Math.ceil(points.length / at);
  return Array.from({ length: Math.ceil(points.length / size) }, (_, i) => {
    const part = points.slice(i * size, (i + 1) * size);
    return part.reduce((a, b) => a + b, 0) / part.length;
  });
}

const n = (v: number) => Math.round(v * 10) / 10;

/** An SVG path through these (x, y): smooth, from the first to the last. */
export function smoothPath(xy: readonly (readonly [number, number])[]): string {
  if (!xy.length) return '';
  const [fx, fy] = xy[0];
  let d = `M${n(fx)},${n(fy)}`;
  for (let i = 1; i < xy.length; i++) {
    const [px, py] = xy[i - 1];
    const [x, y] = xy[i];
    d += ` Q${n(px)},${n(py)} ${n((px + x) / 2)},${n((py + y) / 2)}`;
  }
  const [lx, ly] = xy[xy.length - 1];
  return xy.length > 1 ? `${d} L${n(lx)},${n(ly)}` : d;
}
