import type { ComponentChildren } from 'preact';

/*
 * How long something holds (a certificate's validity): a bar from its
 * start to its end — before its renewal calm, after it a warning, ended an
 * error (nothing renews it: the whole of it as its level says) — now a tick
 * on it, its renewal marked; under it, what is said of each of its times
 * (the caller's words: the kit knows no dates) — its start's and end's
 * under it, at its ends; its renewal's over it, at its mark (kept within
 * it); where it is narrow, all under it in their order (start, renewal,
 * end), their dates one under another. Small (a table's cell): the bar alone, what is said
 * beside it (on the line of the text around it).
 */

export interface LifetimeSpan {
  /** Its start, end, renewal (none: nothing renews it), now — as ms. */
  from: number;
  till: number;
  renewal?: number | undefined;
  now: number;
  /** Nothing renewing it, how its bar is (none: calm). */
  level?: 'warn' | 'error' | undefined;
}

/** A time under the bar: what it is, its date, how far from now (its level: the end near, a renewal past). */
export interface LifetimeMark {
  label: string;
  date: string;
  when: string;
  level?: 'warn' | 'error' | undefined;
}

const along = ({ from, till }: LifetimeSpan, time: number) => Math.min(1, Math.max(0, (time - from) / (till - from || 1)));

/** The bar alone. */
function LifetimeBar(span: LifetimeSpan) {
  const { renewal, now, till, level } = span;
  const at = renewal === undefined ? 1 : along(span, renewal);
  const ended = now >= till;
  return (
    <span class="uk-life-track" aria-hidden="true">
      {ended ? (
        <i data-part="error" style={{ left: 0, right: 0 }} />
      ) : (
        <>
          <i data-part={renewal === undefined ? (level ?? 'ok') : 'ok'} style={{ left: 0, width: `${at * 100}%` }} />
          {renewal !== undefined && <i data-part="warn" style={{ left: `${at * 100}%`, right: 0 }} />}
        </>
      )}
      {renewal !== undefined && !ended && <span class="uk-life-renewal" style={{ left: `${at * 100}%` }} />}
      <span class="uk-life-now" style={{ left: `${along(span, now) * 100}%` }} />
    </span>
  );
}

/** A time said: what it is, its date, how far from now. */
const Mark = ({ m }: { m: LifetimeMark }) => (
  <div>
    <span>{m.label}</span>
    <b>{m.date}</b>
    <small data-level={m.level}>{m.when}</small>
  </div>
);

/** The bar, its times: its start and end under it, its renewal (a third, the middle one) over it, at its mark. */
export function Lifetime({ marks, ...span }: LifetimeSpan & { marks: readonly LifetimeMark[] }) {
  const at = span.renewal === undefined ? 0.5 : along(span, span.renewal);
  const [first, middle, last] = marks.length === 3 ? marks : [marks[0], undefined, marks[1]];
  return (
    <div class="uk-life">
      <div class="uk-life-body">
        {middle && (
          <div class="uk-life-over" style={{ '--at': `${at * 100}%` }}>
            <Mark m={middle} />
          </div>
        )}
        <LifetimeBar {...span} />
        <div class="uk-life-marks">
          {first && <Mark m={first} />}
          {last && <Mark m={last} />}
        </div>
      </div>
    </div>
  );
}

/** In a cell: the bar, what is said beside it in its level's tone (a tip: title). */
export function LifetimeCell({ said, title, level, ...span }: LifetimeSpan & { said: ComponentChildren; title?: string }) {
  return (
    <span class="uk-life-cell" data-level={level} title={title}>
      <LifetimeBar {...span} {...(level ? { level } : {})} />
      <span>{said}</span>
    </span>
  );
}
