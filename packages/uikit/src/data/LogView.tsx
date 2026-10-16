import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../display/Icon';
import { useScale } from '../lib/scale';

/*
 * A log's lines, as many as there are: only those in sight drawn (and some
 * either side), each where the ones above it end — measured as drawn (by
 * its key: wrapped, as tall as it is), else as tall as those measured are
 * on the whole; what is in sight held in place as rows above it are
 * measured or put above it (its first row, how far into it). Followed
 * while it is at its foot: kept there as lines come; scrolled up, held —
 * how many came since said, a click back down. Scrolled to its top, more
 * further back asked for (not while some is on its way: loading). Each line: its
 * source's mark (its colour; its name, when there are several), its time,
 * its text — a warning's, an error's in their colours, what is looked for
 * marked.
 */

export interface LogRow {
  /** The same line, the same key, however read. */
  key: string;
  time?: string;
  text: string;
  /** Whose: its name (said when several are shown), its colour. */
  source?: { name: string; colour: string };
  level?: 'warn' | 'error';
}

export interface LogViewLabels {
  /** The button back down: so many came since. */
  newLines: (count: number) => string;
  /** Said while more further back is read. */
  older: string;
}

const LABELS: LogViewLabels = { newLines: (n) => `${n.toLocaleString()} new lines`, older: 'Reading further back' };

/** A line's height, one line of it (before any is measured). */
const LINE = 18;

/** Its time as shown: the clock's (UTC, as the cluster writes it), to the millisecond. */
const clock = (time?: string) => (time && !Number.isNaN(Date.parse(time)) ? new Date(time).toISOString().slice(11, 23) : '');

export function LogView({
  rows,
  times = true,
  wrap = false,
  find = '',
  sources = false,
  more = false,
  loading = false,
  onOlder,
  onHeld,
  labels = LABELS,
  empty,
}: {
  rows: readonly LogRow[];
  times?: boolean;
  wrap?: boolean;
  /** What is looked for: marked in each line (its case aside). */
  find?: string;
  /** Several sources: each line's said. */
  sources?: boolean;
  /** More further back: asked for at its top. */
  more?: boolean;
  /** Some further back on its way: said so, not asked for again till it is in. */
  loading?: boolean;
  onOlder?: () => void;
  /** Held (scrolled up) or followed again. */
  onHeld?: (held: boolean) => void;
  labels?: LogViewLabels;
  /** Said when there are no lines. */
  empty?: ComponentChildren;
}) {
  const scale = useScale();
  const scroller = useRef<HTMLDivElement>(null);
  const heights = useRef(new Map<string, number>());
  const [version, measure] = useState(0);
  const [view, setView] = useState({ top: 0, height: 600 });
  // At its foot (followed): as the last scroll left it — read when lines come, not as a render saw it.
  const foot = useRef(true);
  const [atFoot, setAtFoot] = useState(true);
  const [seen, setSeen] = useState(0);

  // Drawn otherwise (wrapped, timed, its sources said): measured anew.
  useEffect(() => {
    heights.current.clear();
    measure((v) => v + 1);
  }, [wrap, times, sources, scale]);

  const starts = useMemo(() => {
    // Rows gone (filtered out, let go): their heights too.
    if (heights.current.size > 2 * rows.length + 1000) {
      const keep = new Set(rows.map((r) => r.key));
      for (const k of heights.current.keys()) if (!keep.has(k)) heights.current.delete(k);
    }
    let sum = 0;
    for (const h of heights.current.values()) sum += h;
    const guess = heights.current.size ? sum / heights.current.size : LINE * scale;
    const at = new Float64Array(rows.length + 1);
    for (let i = 0; i < rows.length; i++) at[i + 1] = at[i] + (heights.current.get(rows[i].key) ?? guess);
    return at;
  }, [rows, version]);
  const total = starts[rows.length];
  /** The row at a height: the last starting at or above it. */
  const rowAt = (y: number) => {
    let lo = 0;
    let hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const first = Math.max(0, rowAt(view.top) - 20);
  const last = Math.min(rows.length, rowAt(view.top + view.height) + 20);

  // What is in sight held in place: its first row, how far into it.
  const anchor = useRef<{ key: string; into: number } | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (foot.current) {
      el.scrollTop = el.scrollHeight;
      setSeen(rows.length);
      return;
    }
    const a = anchor.current;
    const i = a ? rows.findIndex((r) => r.key === a.key) : -1;
    if (a && i >= 0 && Math.abs(el.scrollTop - (starts[i] + a.into)) > 0.5) el.scrollTop = starts[i] + a.into;
  }, [starts, atFoot]);
  useEffect(() => onHeld?.(!atFoot), [atFoot]);

  const finding = useMemo(() => (find ? new RegExp(`(${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i') : null), [find]);
  const marked = (text: string) => (finding ? text.split(finding).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p)) : text);

  return (
    <div class="uk-log" data-wrap={wrap ? '' : undefined} data-times={times ? '' : undefined} data-sources={sources ? '' : undefined}>
      {loading && (
        <span class="uk-log-note" data-at="top">
          <span class="uk-spinner" /> {labels.older}
        </span>
      )}
      <div
        class="uk-log-scroll"
        ref={scroller}
        role="log"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a region scrolled by the keyboard too (its lines are what is read).
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          setView({ top: el.scrollTop, height: el.clientHeight });
          foot.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
          setAtFoot(foot.current);
          const i = rowAt(el.scrollTop);
          anchor.current = rows[i] ? { key: rows[i].key, into: el.scrollTop - starts[i] } : null;
          if (el.scrollTop < 120 && more && !loading) onOlder?.();
        }}
      >
        {rows.length === 0 && empty}
        <div class="uk-log-rows" style={{ height: `${total}px` }}>
          {rows.slice(first, last).map((r, n) => (
            <div
              key={r.key}
              class="uk-log-line"
              data-level={r.level}
              style={{ top: `${starts[first + n]}px`, ...(r.source ? { '--uk-log-c': r.source.colour } : {}) }}
              ref={(el) => {
                // Measured as drawn (none laid out — a test's page: as taken).
                const h = el?.offsetHeight;
                if (!h || heights.current.get(r.key) === h) return;
                heights.current.set(r.key, h);
                queueMicrotask(() => measure((v) => v + 1));
              }}
            >
              <b />
              <time>{clock(r.time)}</time>
              <em>{sources ? r.source?.name : ''}</em>
              <span>{marked(r.text)}</span>
            </div>
          ))}
        </div>
      </div>
      {!atFoot && rows.length > seen && (
        <button
          type="button"
          class="uk-log-note"
          data-at="foot"
          onClick={() => {
            const el = scroller.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
        >
          <Icon name="arrow-down" /> {labels.newLines(rows.length - seen)}
        </button>
      )}
    </div>
  );
}
