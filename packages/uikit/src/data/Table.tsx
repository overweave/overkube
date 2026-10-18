import type { ComponentChildren, Ref } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../display/Icon';
import { Skeleton } from '../display/Skeleton';
import { uid } from '../lib/focus';
import { useScale } from '../lib/scale';
import { slideIn, slideOut } from '../lib/slide';
import { useSortable } from '../lib/sortable';

/*
 * A table that draws only the rows in view (and a few around): thousands of
 * rows cost what thirty do — and holds none of them but those it is given:
 * a window of the rows (offset: where it starts; total: how many there are
 * in all), the rest of them placeholders until they come; which rows are in
 * view it says (onRange), for whoever has them to give that window. It
 * sorts nothing: a click on a sortable header asks for it (onSort: by it,
 * again the other way), the sort said back (sort). Its head stays on top
 * and scrolls sideways with the rows. A
 * header's right edge drags its column wider or narrower (arrows too, a
 * double click gives it back); a header dragged moves its column elsewhere
 * (Alt and the arrows too): lifted on a card, leaning as it moves, the
 * others moving aside as its edge comes into them, a slot where it lands. Rows are as high as their cells: one line,
 * or more in a column that wraps; each is measured as it is drawn — but
 * of a window (total given): as high as rowHeight, each where its place
 * says (rows it does not hold are never measured).
 */

export interface TableColumn<T> {
  id: string;
  header: ComponentChildren;
  /** Its name for those who cannot see it, where the header says none (an icon, nothing). */
  label?: string;
  /** A CSS grid track: "2fr", "120px", "minmax(80px, 1fr)". */
  width?: string;
  cell: (row: T) => ComponentChildren;
  /** A click on its header asks to sort by it (onSort). */
  sortable?: boolean;
  /** Its cells wrap onto more lines (the row grows) instead of being cut. */
  wrap?: boolean;
}

/** How rows are sorted: by a column, either way. */
export interface TableSort {
  id: string;
  desc?: boolean;
}

export interface TableProps<T> {
  /** The rows given: a window of them, from offset (none: all of them, from 0). */
  rows: readonly T[];
  offset?: number;
  /** How many rows there are in all (none: offset and those given). */
  total?: number;
  /** Which rows are in view (and drawn around them): from first, up to (not with) last — the window to give. */
  onRange?: (first: number, last: number) => void;
  /** How they are sorted, as said back (its header shows it). */
  sort?: TableSort;
  /** A sortable header clicked: by it, or by it the other way. */
  onSort?: (sort: TableSort) => void;
  columns: TableColumn<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** The row chosen (its key): marked as it is (aria-selected). */
  selected?: string | undefined;
  /** Its height at most (it scrolls inside). */
  height?: string;
  /** A row's height at least, and as it is taken before it is measured. */
  rowHeight?: number;
  /** Rows drawn beyond those in view, each side. */
  overscan?: number;
  /** What it says with no rows. */
  empty?: ComponentChildren;
  /** Its rows are on their way: its head as it is, a few rows of placeholders under it. Said busy (aria-busy). */
  loading?: boolean;
  /** How long it waits before showing its placeholders (rows that come sooner, come at once; default 200 ms; 0: at once). */
  placeholdersAfter?: number;
  /** Columns may be dragged wider or narrower (default: yes). */
  resizable?: boolean;
  /** A column given a width by the user ("180px"), or given back its own (undefined). */
  onResize?: (id: string, width: string | undefined) => void;
  /** Columns may be dragged elsewhere (default: yes). */
  reorderable?: boolean;
  /** The columns' order the user made. */
  onReorder?: (ids: string[]) => void;
  /** Drawn in what holds it (a section, a card): no frame, no ground of its own, its rows from its edges — what holds it frames it. */
  plain?: boolean;
  /** A row's context menu asked for (a right click on it; the menu key, Shift+F10 in it): the page's to open, or not (the browser's then). */
  onRowMenu?: (row: T, event: MouseEvent | KeyboardEvent) => void;
}

/** The height the body is taken to have before it is measured (and where nothing measures: tests). */
const FALLBACK_HEIGHT = 600;
/** The head's height (the CSS's), before it is measured. */
const HEAD_HEIGHT = 32;
/** A column at its narrowest, dragged. */
const MIN_WIDTH = 48;
/** A column with no width in pixels, as the table's own width counts it (narrower, and the table scrolls sideways). */
const FLEX_WIDTH = 96;
/** The CSS's: the gap between columns, the padding of a row. */
const GAP = 24;
const PAD = 16;
/** How many rows a change may add, remove or move and still be drawn moving (more: at once). */
const CALM = 8;
/** How long a row gone takes to fold (the CSS's). */
const LEAVE_MS = 220;
/** How long the placeholders below the rows take to fold away. */
const FOLD_MS = LEAVE_MS + 40;
/** Placeholder rows while its rows are on their way (loading: true). */
const PLACEHOLDERS = 5;
/** Rows that come sooner than this need no placeholders: none flashed for a frame. */
const PLACEHOLDERS_AFTER_MS = 200;
/** Placeholders once shown stay at least this long: not a flash either. */
const PLACEHOLDERS_FOR_MS = 400;

/** A row gone, drawn a moment where it was. */
interface Leaving<T> {
  key: string;
  row: T;
  height: number;
  /** The row that followed it, still there (none: it was the last). */
  before?: string;
  until: number;
}

/** How far an arrow moves a column's edge. */
const STEP = 16;

export function Table<T>({
  rows,
  offset = 0,
  total,
  onRange,
  sort,
  onSort,
  rowKey,
  onRowClick,
  selected,
  height = '70vh',
  rowHeight: asked = 34,
  overscan = 8,
  empty,
  loading = false,
  placeholdersAfter = PLACEHOLDERS_AFTER_MS,
  resizable = true,
  onResize,
  reorderable = true,
  onReorder,
  onRowMenu,
  plain = false,
  columns: given,
}: TableProps<T>) {
  // As high, as wide, at the page's scale.
  const scale = useScale();
  const rowHeight = asked * scale;
  const ids = useMemo(() => ({ header: uid('uk-table-h') }), []);
  const [scroll, setScroll] = useState(0);
  const [view, setView] = useState(FALLBACK_HEIGHT);
  const [sized, setSized] = useState<Record<string, number>>({});
  const [resizing, setResizing] = useState<string>();
  const head = useRef<HTMLDivElement>(null);

  // Columns in the order the user dragged them to (until they are given in it), those new to it after.
  const [order, setOrder] = useState<string[]>();
  const columns = useMemo(() => {
    if (!order) return given;
    const at = (c: TableColumn<T>) => {
      const i = order.indexOf(c.id);
      return i < 0 ? order.length : i;
    };
    return [...given].sort((a, b) => at(a) - at(b));
  }, [given, order]);
  // Given in another order (the user's, kept; another table's): that one, from now on.
  const givenOrder = given.map((c) => c.id).join('\n');
  useEffect(() => setOrder(undefined), [givenOrder]);
  const scroller = useRef<HTMLDivElement | null>(null);
  const sortable = useSortable({
    ids: columns.map((c) => c.id),
    scroller,
    disabled: !reorderable,
    swap: 'edge',
    tilt: true,
    duration: 420,
    onMove: (ids) => {
      setOrder(ids);
      onReorder?.(ids);
    },
  });

  // The scroller measured whenever it is there and whenever it changes size (a callback: it may come after the first draw).
  const sizeObserver = useRef<ResizeObserver>();
  const attach = (el: HTMLDivElement | null) => {
    if (el === scroller.current) return;
    sizeObserver.current?.disconnect();
    scroller.current = el;
    if (!el) return;
    const measure = () => setView(el.clientHeight || FALLBACK_HEIGHT);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    sizeObserver.current = new ResizeObserver(measure);
    sizeObserver.current.observe(el);
  };
  useEffect(() => () => sizeObserver.current?.disconnect(), []);

  // Rows' heights as measured (by key), else rowHeight; where each row starts.
  const heights = useRef(new Map<string, number>());
  const [measured, setMeasured] = useState(0);
  const rowObserver = useMemo(
    () =>
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver((entries) => {
            let changed = false;
            for (const e of entries) {
              const el = e.target as HTMLElement;
              const h = el.offsetHeight;
              const key = el.dataset.key;
              if (!key || !h || heights.current.get(key) === h) continue;
              heights.current.set(key, h);
              changed = true;
            }
            if (changed) setMeasured((m) => m + 1);
          }),
    [],
  );
  useEffect(() => () => rowObserver?.disconnect(), [rowObserver]);
  // A row watched while it is drawn, let go when it is not (scrolled out).
  const rowEls = useRef(new Map<string, HTMLElement>());
  const watch = (key: string) => (el: HTMLElement | null) => {
    const was = rowEls.current.get(key);
    if (was === el) return;
    if (was) rowObserver?.unobserve(was);
    if (el) {
      rowEls.current.set(key, el);
      rowObserver?.observe(el);
    } else rowEls.current.delete(key);
  };
  // The rows given (their keys), where they are among all of them.
  const keys = useMemo(() => rows.map(rowKey), [rows, rowKey]);
  const count = total ?? offset + rows.length;
  // A window of them: each as high as rowHeight, where its place says (no list of them all: 100k rows, nothing held).
  const windowed = total !== undefined;
  const measuredStarts = useMemo(() => {
    if (windowed) return [];
    const at = new Array<number>(count + 1);
    at[0] = 0;
    for (let i = 0; i < count; i++) at[i + 1] = at[i] + Math.max(rowHeight, heights.current.get(keys[i]) ?? rowHeight);
    return at;
  }, [windowed, keys, count, rowHeight, measured]);
  /** Where a row starts (count: where the last one ends). */
  const startOf = (i: number) => (windowed ? i * rowHeight : measuredStarts[i]);
  /** The row at a height of the body: the last starting at or above it. */
  const rowAt = (y: number) => {
    if (windowed) return Math.max(0, Math.min(count, Math.floor(y / rowHeight)));
    let lo = 0;
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (measuredStarts[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const top = Math.max(0, scroll - (head.current?.offsetHeight || HEAD_HEIGHT));
  const first = Math.max(0, rowAt(top) - overscan);
  const last = Math.min(count, rowAt(top + view) + 1 + overscan);
  // The rows in view, said: whoever has them gives that window (none in view yet — no rows at all: nothing said).
  useEffect(() => {
    if (last > first) onRange?.(first, last);
  }, [first, last]);

  // What the data changed, drawn as it moves: a row gone from those drawn fades and folds (the rows under it rise); a
  // row new to the list fades in; a few rows moved slide to where they are (FLIP). Not a new sort, a scroll, a change of
  // many rows (a filter, another namespace): those are drawn at once — as is everything under prefers-reduced-motion.
  const last_ = useRef<{ keys: string[]; drawn: Map<string, { row: T; height: number }>; sort: typeof sort; scroll: number; waiting: boolean }>();
  const tops = useRef(new Map<string, number>());
  const [, setTick] = useState(0);
  const motion = useMemo(() => {
    const was = last_.current;
    // The first rows after waiting for them (a load): drawn as they are, not as rows new to the list.
    if (!was || was.keys === keys || was.waiting) return { calm: false, born: new Set<string>(), leaving: [] as Leaving<T>[] };
    const now = new Set(keys);
    const before = new Set(was.keys);
    const added = keys.filter((k) => !before.has(k));
    const removed = was.keys.filter((k) => !now.has(k));
    const common = was.keys.filter((k) => now.has(k));
    const order = keys.filter((k) => before.has(k));
    const moved = common.filter((k, i) => order[i] !== k).length;
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const calm = !still && was.sort === sort && was.scroll === scroll && added.length + removed.length + moved <= CALM;
    if (!calm) return { calm: false, born: new Set<string>(), leaving: [] as Leaving<T>[] };
    // Those drawn that went: kept a moment where they were, before the row that followed them (still there).
    const at = Date.now();
    const leaving = removed
      .filter((k) => was.drawn.has(k))
      .map((k) => {
        const i = was.keys.indexOf(k);
        const next = was.keys.slice(i + 1).find((n) => now.has(n));
        const drawn = was.drawn.get(k) as { row: T; height: number };
        return { key: k, row: drawn.row, height: drawn.height, before: next, until: at + LEAVE_MS };
      });
    return { calm, born: new Set(added), leaving };
  }, [keys]);
  // Those still leaving (from changes before this one too), drawn among the rows; gone once folded.
  const leavingRef = useRef<Leaving<T>[]>([]);
  if (motion.leaving.length) leavingRef.current = [...leavingRef.current.filter((l) => !motion.leaving.some((m) => m.key === l.key)), ...motion.leaving];
  leavingRef.current = leavingRef.current.filter((l) => l.until > Date.now() && !keys.includes(l.key));
  const leaving = leavingRef.current;
  useEffect(() => {
    if (!leaving.length) return;
    const t = setTimeout(() => setTick((n) => n + 1), Math.max(0, Math.min(...leaving.map((l) => l.until)) - Date.now()) + 10);
    return () => clearTimeout(t);
  }, [leaving.length, leaving[0]?.until]);

  // A column's width given anew (the user's, kept and given back; taken back): what was dragged of it gives way — the others' kept.
  const widthsGiven = useRef<Record<string, string | undefined>>();
  useEffect(() => {
    const now = Object.fromEntries(given.map((c) => [c.id, c.width]));
    const before = widthsGiven.current;
    widthsGiven.current = now;
    if (!before) return;
    const anew = Object.keys(now).filter((id) => now[id] !== before[id]);
    if (anew.length) setSized((sized) => Object.fromEntries(Object.entries(sized).filter(([id]) => !anew.includes(id))));
  }, [given.map((c) => `${c.id}:${c.width ?? ''}`).join('\n')]);
  // Columns as wide as the user dragged them, else as they are given.
  const track = (c: TableColumn<T>) => (sized[c.id] !== undefined ? `${sized[c.id]}px` : (c.width ?? 'minmax(0, 1fr)'));
  const template = columns.map(track).join(' ');
  // At least: as dragged, its width in px, its minmax's least (minmax(120px, 1fr)); a free one, FLEX_WIDTH.
  const least = (width: string | undefined) => /^(?:minmax\(\s*)?(\d+(?:\.\d+)?)px\b/.exec(width ?? '')?.[1];
  const pixels = (c: TableColumn<T>) => sized[c.id] ?? (least(c.width) === undefined ? FLEX_WIDTH : Number.parseFloat(least(c.width) as string));
  const minWidth = columns.reduce((sum, c) => sum + pixels(c), 0) + (GAP * (columns.length - 1) + (plain ? 0 : PAD * 2)) * scale;

  const setWidth = (id: string, px: number | undefined, done: boolean) => {
    const width = px === undefined ? undefined : Math.max(MIN_WIDTH, Math.round(px));
    setSized(({ [id]: _was, ...rest }) => (width === undefined ? rest : { ...rest, [id]: width }));
    if (done) onResize?.(id, width === undefined ? undefined : `${width}px`);
  };
  const widthOf = (handle: HTMLElement) => (handle.parentElement as HTMLElement).getBoundingClientRect().width;
  const drag = (id: string) => (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    const from = e.clientX;
    const start = sized[id] ?? widthOf(handle);
    let now = start;
    handle.setPointerCapture?.(e.pointerId);
    setResizing(id);
    const move = (m: PointerEvent) => {
      now = start + m.clientX - from;
      setWidth(id, now, false);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      setResizing(undefined);
      if (now !== start) setWidth(id, now, true);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };
  const nudge = (id: string) => (e: KeyboardEvent) => {
    const by = e.key === 'ArrowRight' ? STEP : e.key === 'ArrowLeft' ? -STEP : 0;
    if (!by) return;
    e.preventDefault();
    setWidth(id, (sized[id] ?? widthOf(e.currentTarget as HTMLElement)) + by, true);
  };

  // Placeholders, only if the rows are slow: none for the first moments (rows that come by then come at once, with no
  // flash of placeholders before them); once shown, kept a while (not a flash either). Then the rows in their place,
  // each where a placeholder was, as they are; the placeholders below the rows fold away (as a row gone does).
  const [shown, setShown] = useState(() => loading && placeholdersAfter <= 0);
  const shownAt = useRef(shown ? Date.now() : 0);
  useEffect(() => {
    if (loading && !shown) {
      const t = setTimeout(() => {
        shownAt.current = Date.now();
        setShown(true);
      }, placeholdersAfter);
      return () => clearTimeout(t);
    }
    if (!loading && shown) {
      const t = setTimeout(() => setShown(false), Math.max(0, PLACEHOLDERS_FOR_MS - (Date.now() - shownAt.current)));
      return () => clearTimeout(t);
    }
  }, [loading, shown]);
  /** Still waiting for its rows (or keeping its placeholders a while): no rows drawn yet. */
  const waiting = loading || shown;
  // Placeholders gone, rows in: those below the rows fold away — the bottom ones, as they were (their own nodes).
  const wasShown = useRef(shown);
  const folding = useRef<{ from: number; until: number } | null>(null);
  if (wasShown.current && !shown) {
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const from = Math.min(PLACEHOLDERS, keys.length);
    folding.current = still || from === PLACEHOLDERS ? null : { from, until: Date.now() + FOLD_MS };
  }
  wasShown.current = shown;
  if (folding.current && folding.current.until <= Date.now()) folding.current = null;
  const fold = folding.current;
  useEffect(() => {
    if (!fold) return;
    const t = setTimeout(() => setTick((n) => n + 1), Math.max(0, fold.until - Date.now()) + 10);
    return () => clearTimeout(t);
  }, [fold?.until]);
  /** A placeholder row: a line in each cell, of a width of its own. */
  const placeholder = (i: number, leaving = false) => (
    <div
      key={`skeleton-${i}`}
      class="uk-table-row"
      data-skeleton=""
      data-leaving={leaving ? '' : undefined}
      aria-hidden="true"
      style={{ gridTemplateColumns: template, minHeight: `${rowHeight}px`, ...(leaving ? { '--uk-row-h': `${rowHeight}px` } : {}) }}
    >
      {columns.map((c) => (
        <div key={c.id} {...sortable.item(c.id)}>
          <Skeleton width={`${55 + ((i * 37 + c.id.length * 13) % 40)}%`} />
        </div>
      ))}
    </div>
  );
  const leavingPlaceholders = fold ? Array.from({ length: PLACEHOLDERS - fold.from }, (_, i) => placeholder(fold.from + i, true)) : [];

  // The rows drawn: those in view (a placeholder where one is not given yet), and those leaving among them (before the row that followed them).
  type Drawn = { row?: T; key: string; index: number; gone?: Leaving<T> };
  const drawnRows: Drawn[] = [];
  for (let i = first; i < last; i++) {
    const at = i - offset;
    drawnRows.push(at >= 0 && at < rows.length ? { row: rows[at], key: keys[at], index: i } : { key: `\0gap-${i}`, index: i });
  }
  for (const l of leaving) {
    const at = l.before === undefined ? -1 : drawnRows.findIndex((d) => d.key === l.before);
    // Its follower out of view (or it was the last, and the last is drawn): where it would be; else not drawn.
    if (at >= 0) drawnRows.splice(at, 0, { row: l.row, key: l.key, index: -1, gone: l });
    else if (l.before === undefined && last === count) drawnRows.push({ row: l.row, key: l.key, index: -1, gone: l });
  }

  // After each draw: the rows a calm change moved slide from where they were (FLIP); where each is, kept for the next.
  useLayoutEffect(() => {
    const now = new Map<string, number>();
    for (const [key, el] of rowEls.current) {
      if (!el.isConnected) continue;
      const at = el.offsetTop;
      now.set(key, at);
      const was = tops.current.get(key);
      if (motion.calm && was !== undefined && was !== at && !el.hasAttribute('data-enter') && typeof el.animate === 'function') {
        el.animate([{ transform: `translateY(${was - at}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2, 0, 0, 1)' });
      }
    }
    tops.current = now;
    last_.current = {
      keys,
      sort,
      scroll,
      waiting,
      drawn: new Map(
        drawnRows.filter((d) => !d.gone && d.row !== undefined).map((d) => [d.key, { row: d.row as T, height: rowEls.current.get(d.key)?.offsetHeight || rowHeight }]),
      ),
    };
  });

  // The column dragged, lifted: a card under its cells, its header on the card's cap, a slot where it lands.
  // Placed after each draw while it is (rows drawn meanwhile, scrolled to or new; the table's height changed).
  const card = useRef<HTMLDivElement>(null);
  const cap = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const lifted = columns.find((c) => c.id === sortable.active);
  useLayoutEffect(() => {
    const s = scroller.current;
    const th = lifted && head.current?.querySelector<HTMLElement>(`[data-sort-id="${CSS.escape(lifted.id)}"]`);
    if (!s || !th || !lifted) return;
    const at = (el: HTMLElement | null, left: number, width: number, top: number, height: number) =>
      el && Object.assign(el.style, { left: `${left}px`, width: `${width}px`, top: `${top}px`, height: `${height}px` });
    const h = head.current?.offsetHeight ?? HEAD_HEIGHT;
    at(card.current, th.offsetLeft - 10, th.offsetWidth + 20, s.scrollTop, s.clientHeight);
    at(cap.current, th.offsetLeft - 10, th.offsetWidth + 20, s.scrollTop, h);
    at(slot.current, th.offsetLeft - 6, th.offsetWidth + 12, s.scrollTop + h + 4, s.clientHeight - h - 8);
    if (cap.current) cap.current.style.transformOrigin = `50% ${s.clientHeight / 2}px`;
    // Its cells turn and grow about the card's middle, as the card does.
    const middle = s.getBoundingClientRect().top + s.clientHeight / 2;
    for (const el of sortable.root.current?.querySelectorAll<HTMLElement>('.uk-table-row > [data-sort-active]') ?? [])
      el.style.transformOrigin = `50% ${middle - el.getBoundingClientRect().top}px`;
  });
  const liftedShift = lifted && { '--uk-drag-x': `var(--uk-sort-${columns.indexOf(lifted)}, 0px)` };

  const lastColumn = columns.length - 1;
  return (
    <div
      class="uk-table"
      data-plain={plain ? '' : undefined}
      ref={sortable.root as Ref<HTMLDivElement>}
      role="table"
      aria-rowcount={waiting ? -1 : count + 1}
      aria-busy={waiting ? true : undefined}
      data-resizing={resizing !== undefined ? '' : undefined}
    >
      <div
        class="uk-table-body"
        ref={attach}
        style={{ maxHeight: height }}
        onPointerOver={slideIn}
        onPointerOut={slideOut}
        onScroll={(e) => setScroll((e.currentTarget as HTMLDivElement).scrollTop)}
      >
        <div class="uk-table-inner" style={{ minWidth: `${minWidth}px` }}>
          {/* biome-ignore lint/a11y/useFocusableInteractive: the header row is not a stop; its buttons are. */}
          <div class="uk-table-head" role="row" aria-rowindex={1} ref={head} style={{ gridTemplateColumns: template }}>
            {columns.map((c, i) => {
              const on = sort?.id === c.id;
              return (
                // biome-ignore lint/a11y/useFocusableInteractive: a header cell is not a stop; its button and its edge are.
                <div
                  key={c.id}
                  {...sortable.item(c.id)}
                  class="uk-table-th"
                  role="columnheader"
                  aria-label={c.label}
                  aria-sort={on ? (sort?.desc ? 'descending' : 'ascending') : c.sortable ? 'none' : undefined}
                  data-resizing={resizing === c.id ? '' : undefined}
                >
                  <button
                    type="button"
                    id={`${ids.header}-${c.id}`}
                    aria-label={c.label}
                    data-sorted={on ? (sort?.desc ? 'desc' : 'asc') : undefined}
                    disabled={!c.sortable && !reorderable}
                    {...(reorderable ? sortable.handle(c.id) : {})}
                    onClick={() => c.sortable && onSort?.(on ? { id: c.id, desc: !sort?.desc } : { id: c.id })}
                  >
                    <span class="uk-table-title">{c.header}</span>
                    {on && (
                      <span class="uk-table-sort" data-dir={sort?.desc ? 'desc' : 'asc'}>
                        <Icon name="chevron" />
                      </span>
                    )}
                  </button>
                  {resizable && i < lastColumn && (
                    <div
                      class="uk-table-resize"
                      role="separator"
                      aria-orientation="vertical"
                      aria-labelledby={`${ids.header}-${c.id}`}
                      aria-valuenow={sized[c.id]}
                      aria-valuemin={MIN_WIDTH}
                      tabIndex={0}
                      onPointerDown={drag(c.id)}
                      onKeyDown={nudge(c.id)}
                      onDblClick={() => setWidth(c.id, undefined, true)}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {lifted && (
            <>
              <div class="uk-table-slot" ref={slot} aria-hidden="true" />
              <div class="uk-table-card" ref={card} aria-hidden="true" style={liftedShift} />
              <div class="uk-table-card-cap" ref={cap} aria-hidden="true" style={liftedShift}>
                <span class="uk-table-title">{lifted.header}</span>
              </div>
            </>
          )}
          {waiting ? (
            <div role="rowgroup">{Array.from({ length: shown ? PLACEHOLDERS : 0 }, (_, i) => placeholder(i))}</div>
          ) : count === 0 ? (
            <>
              {leavingPlaceholders.length > 0 && <div role="rowgroup">{leavingPlaceholders}</div>}
              <div class="uk-table-empty">{empty}</div>
            </>
          ) : (
            <div role="rowgroup" style={{ paddingTop: `${startOf(first)}px`, paddingBottom: `${startOf(count) - startOf(last)}px` }}>
              {drawnRows.map(({ row, key, index, gone }) => {
                // Not given yet (out of the window given): a placeholder in its place.
                if (row === undefined) return placeholder(index);
                if (gone) {
                  return (
                    <div
                      key={key}
                      class="uk-table-row"
                      data-leaving=""
                      aria-hidden="true"
                      style={{ gridTemplateColumns: template, minHeight: `${rowHeight}px`, '--uk-row-h': `${gone.height}px` }}
                    >
                      {columns.map((c) => (
                        <div key={c.id} {...sortable.item(c.id)} data-wrap={c.wrap ? '' : undefined}>
                          <span class="uk-cell-in">{c.cell(row)}</span>
                        </div>
                      ))}
                    </div>
                  );
                }
                return (
                  <div
                    key={key}
                    data-key={key}
                    data-enter={motion.born.has(key) ? '' : undefined}
                    ref={watch(key)}
                    class="uk-table-row"
                    role="row"
                    aria-rowindex={index + 2}
                    data-clickable={onRowClick ? '' : undefined}
                    aria-selected={selected === undefined ? undefined : selected === key}
                    style={{ gridTemplateColumns: template, minHeight: `${rowHeight}px` }}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={
                      onRowClick &&
                      ((e) => {
                        // A link, a button in it: theirs (a link opened its own way: in a new tab too), not the row's.
                        const at = (e.target as Element).closest?.('a, button, input, select, textarea, [role="button"]');
                        if (at && at !== e.currentTarget && e.currentTarget.contains(at)) return;
                        onRowClick(row);
                      })
                    }
                    onContextMenu={onRowMenu && ((e) => onRowMenu(row, e))}
                    onKeyDown={(e) => {
                      onRowMenu?.(row, e);
                      if (onRowClick && e.target === e.currentTarget && e.key === 'Enter') onRowClick(row);
                    }}
                  >
                    {columns.map((c) => (
                      <div key={c.id} {...sortable.item(c.id)} role="cell" data-wrap={c.wrap ? '' : undefined}>
                        <span class="uk-cell-in">{c.cell(row)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
              {leavingPlaceholders}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
