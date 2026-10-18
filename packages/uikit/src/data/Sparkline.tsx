import { useId } from 'preact/hooks';
import { calm, smoothPath } from '../lib/curve';

/*
 * How something went, drawn small beside its number (a pod's CPU over the
 * last hour): a smooth line in the accent, the area under it fading out,
 * a dot where it is now. From nothing up to its most — steady is flat, a
 * leak a slope, a spike a spike. Only a picture: its number says it.
 */
export function Sparkline({ points, width = 60, height = 22 }: { points: readonly number[]; width?: number; height?: number }) {
  const fade = useId();
  if (points.length < 2) return null;
  const line = calm(points, 16);
  const most = Math.max(...line) || 1;
  const xy = line.map((v, i) => [(i / (line.length - 1)) * width, height - 2 - (v / most) * (height - 6)] as const);
  const path = smoothPath(xy);
  const [x, y] = xy[xy.length - 1];
  return (
    <svg class="uk-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--uk-accent)" stop-opacity="0.35" />
          <stop offset="1" stop-color="var(--uk-accent)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={`url(#${fade})`} />
      <path class="uk-spark-line" d={path} />
      <circle cx={x} cy={y} r="2" />
    </svg>
  );
}
