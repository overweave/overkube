import { useId, useMemo, useState } from 'preact/hooks';
import { smoothPath } from '../lib/curve';

/*
 * How something went over a range (a pod's memory over the last hour): its
 * name and its number now over it; a smooth line in the accent, the area
 * under it fading out; marks across it (requests, a limit) dashed in their
 * tone — one past its top (a max given) not drawn — said under it, with
 * their unit, between where the range starts and ends. Pointed at, or
 * stepped through by keys (arrows, Home, End; Escape lets go), a line where
 * it is, a dot on the line and when and how much in a tip — the number over
 * it that point's; let go, now again. What the times are called is the
 * caller's (the kit knows no minutes and no words): when(i) of a point.
 */

export interface TimeChartMark {
  label: string;
  value: number;
  tone: 'info' | 'ok' | 'warn' | 'error';
}

export interface TimeChartProps {
  title: string;
  points: readonly number[];
  unit?: string;
  /** The top of its scale (none, or none above 0: a little over its most, or its highest mark); a value past it drawn at it. */
  max?: number;
  marks?: readonly TimeChartMark[];
  /** What the range's start and end are called ("1h ago", "now"). */
  start: string;
  end: string;
  /** What a point's time is called ("23 min ago"). */
  when: (index: number) => string;
  /** A value as said (none: rounded). */
  format?: (value: number) => string;
}

const [W, H] = [600, 110];

export function TimeChart({ title, points, unit = '', max, marks = [], start, end, when, format = (v) => String(Math.round(v)) }: TimeChartProps) {
  const [at, setAt] = useState<number | null>(null);
  const fade = useId();
  // Its top: as given (above none), else a little over its most; a value past it, at it.
  const top = (max && max > 0 ? max : Math.max(...points, ...marks.map((m) => m.value)) * 1.1) || 1;
  const y = (v: number) => H - 4 - (Math.min(Math.max(v, 0), top) / top) * (H - 10);
  // Its line, made once for its points (not as the pointer moves): one point, flat across.
  const xy = useMemo(() => points.map((v, i) => [points.length > 1 ? (i / (points.length - 1)) * W : W, y(v)] as const), [points, top]);
  const path = useMemo(() => smoothPath(xy.length === 1 ? [[0, xy[0][1]], xy[0]] : xy), [xy]);
  if (!points.length) return null;
  const last = points.length - 1;
  const shown = at ?? last;
  const [sx, sy] = xy[shown];
  const left = (sx / W) * 100;
  const said = `${format(points[shown])}${unit}`;
  const move = (to: number | null) => setAt(to === null ? null : Math.max(0, Math.min(last, to)));
  return (
    <div class="uk-chart">
      <div class="uk-chart-head">
        <span>{title}</span>
        <b>
          {format(points[shown])}
          {unit && <span>{unit}</span>}
        </b>
      </div>
      <div
        class="uk-chart-plot"
        role="slider"
        tabIndex={0}
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={shown}
        aria-valuetext={`${when(shown)}: ${said}`}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          move(Math.round(((e.clientX - box.left) / (box.width || 1)) * last));
        }}
        onPointerLeave={() => move(null)}
        onBlur={() => move(null)}
        onKeyDown={(e) => {
          const step = { ArrowLeft: shown - 1, ArrowRight: shown + 1, Home: 0, End: last }[e.key];
          if (step !== undefined) {
            e.preventDefault();
            move(step);
          } else if (e.key === 'Escape') move(null);
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="var(--uk-accent)" stop-opacity="0.3" />
              <stop offset="1" stop-color="var(--uk-accent)" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L${W},${H} L0,${H} Z`} fill={`url(#${fade})`} />
          {marks
            .filter((m) => m.value <= top)
            .map((m) => (
              <line key={m.label} class="uk-chart-mark" data-tone={m.tone} x1="0" x2={W} y1={y(m.value)} y2={y(m.value)} vector-effect="non-scaling-stroke" />
            ))}
          <path class="uk-chart-line" d={path} vector-effect="non-scaling-stroke" />
          {at !== null && <line class="uk-chart-cursor" x1={sx} x2={sx} y1="0" y2={H} vector-effect="non-scaling-stroke" />}
        </svg>
        <i class="uk-chart-dot" style={{ left: `${left}%`, top: `${(sy / H) * 100}%` }} />
        {at !== null && (
          <span class="uk-chart-tip" style={{ left: `${Math.min(88, Math.max(12, left))}%` }}>
            {when(at)} · <b>{format(points[at])}</b>
            {unit}
          </span>
        )}
      </div>
      <div class="uk-chart-axis">
        <span>{start}</span>
        <span>{marks.map((m) => `${m.label} ${format(m.value)}${unit}`).join(' · ')}</span>
        <span>{end}</span>
      </div>
    </div>
  );
}
