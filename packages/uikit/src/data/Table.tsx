import type { ComponentChildren, Ref } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../display/Icon';
import { Skeleton } from '../display/Skeleton';
import { uid } from '../lib/focus';
import { useSortable } from '../lib/sortable';

/*
 * A table that draws only the rows in view (and a few around): thousands of
 * rows cost what thirty do. Its head stays on top and scrolls sideways with
 * the rows. A click on a header sorts by it (again: the other way); a
 * header's right edge drags its column wider or narrower (arrows too, a
 * double click gives it back); a header dragged moves its column elsewhere
 * (Alt and the arrows too): lifted on a card, leaning as it moves, the
 * others moving aside as its edge comes into them, a slot where it lands. Rows are as high as their cells: one line,
 * or more in a column that wraps; each is measured as it is drawn. Rows
 * may be picked (a check each, one for all of them, Shift for a run).
 */

export interface TableColumn<T> {
  id: string;
  header: ComponentChildren;
  /** Its name for those who cannot see it, where the header says none (an icon, nothing). */
  label?: string;
  /** A CSS grid track: "2fr", "120px", "minmax(80px, 1fr)". */
  width?: string;
  cell: (row: T) => ComponentChildren;
  /** What it sorts by; not sortable without. */
  sort?: (row: T) => string | number | undefined;
  /** Its cells wrap onto more lines (the row grows) instead of being cut. */
  wrap?: boolean;
}

export interface TableSelection {
  /** The keys of the rows picked. */
  selected: ReadonlySet<string>;
  onChange: (selected: Set<string>) => void;
  /** The name of the check picking all of them: "All pods". */
  label: string;
}

export interface TableProps<T> {
  rows: readonly T[];
  columns: TableColumn<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
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
  /** How it is sorted at first, and again whenever this changes. */
  initialSort?: { id: string; desc?: boolean };
  /** Columns may be dragged wider or narrower (default: yes). */
  resizable?: boolean;
  /** A column given a width by the user ("180px"), or given back its own (undefined). */
  onResize?: (id: string, width: string | undefined) => void;
  /** Columns may be dragged elsewhere (default: yes). */
  reorderable?: boolean;
  /** The columns' order the user made. */
  onReorder?: (ids: string[]) => void;
  /** Rows may be picked. */
  selection?: TableSelection;
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
/** The CSS's: the gap between columns, the padding of a row, the checks' column. */
const GAP = 24;
const PAD = 16;
const CHECK = 20;
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
  rowKey,
  onRowClick,
  height = '70vh',
  rowHeight = 34,
  overscan = 8,
  empty,
  loading = false,
  placeholdersAfter = PLACEHOLDERS_AFTER_MS,
  initialSort,
  resizable = true,
  onResize,
  reorderable = true,
  onReorder,
  selection,
  onRowMenu,
  columns: given,
}: TableProps<T>) {
  const ids = useMemo(() => ({ header: uid('uk-table-h') }), []);
  const [scroll, setScroll] = useState(0);
  const [view, setView] = useState(FALLBACK_HEIGHT);
  const [sort, setSort] = useState(initialSort);
  const [sized, setSized] = useState<Record<string, number>>({});
  const [resizing, setResizing] = useState<string>();
  const head = useRef<HTMLDivElement>(null);
  const anchor = useRef<string>();

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

  // Sorted as it is told again (another kind's table, the user's sort).
  const sortKey = initialSort && `${initialSort.id}:${initialSort.desc ?? false}`;
  useEffect(() => setSort(initialSort), [sortKey]);

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

  // What each row sorts by, read at each drawing: a value that changed on its own (one that came later) sorts it again.
  const sortBy = sort && columns.find((c) => c.id === sort.id)?.sort;
  const by = sortBy ? rows.map(sortBy) : undefined;
  const byRef = useRef(by);
  if (by && byRef.current && (by.length !== byRef.current.length || by.some((v, i) => v !== byRef.current?.[i]))) byRef.current = by;
  else if (!by || !byRef.current) byRef.current = by;
  const sorted = useMemo(() => {
    const values = byRef.current;
    if (!values) return rows;
    const dir = sort?.desc ? -1 : 1;
    return rows
      .map((row, i) => ({ row, v: values[i] }))
      .sort((a, b) => {
        const x = a.v;
        const y = b.v;
        if (x === y) return 0;
        if (x === undefined) return 1;
        if (y === undefined) return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir;
      })
      .map((e) => e.row);
  }, [rows, sort, byRef.current]);

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
  const keys = useMemo(() => sorted.map(rowKey), [sorted, rowKey]);
  const starts = useMemo(() => {
    const at = new Array<number>(keys.length + 1);
    at[0] = 0;
    for (let i = 0; i < keys.length; i++) at[i + 1] = at[i] + Math.max(rowHeight, heights.current.get(keys[i]) ?? rowHeight);
    return at;
  }, [keys, rowHeight, measured]);
  /** The row at a height of the body: the last starting at or above it. */
  const rowAt = (y: number) => {
    let lo = 0;
    let hi = keys.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const top = Math.max(0, scroll - (head.current?.offsetHeight || HEAD_HEIGHT));
  const first = Math.max(0, rowAt(top) - overscan);
  const last = Math.min(keys.length, rowAt(top + view) + 1 + overscan);

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

  // Columns as wide as the user dragged them, else as they are given.
  const track = (c: TableColumn<T>) => (sized[c.id] !== undefined ? `${sized[c.id]}px` : (c.width ?? 'minmax(0, 1fr)'));
  const template = [...(selection ? [`${CHECK}px`] : []), ...columns.map(track)].join(' ');
  const pixels = (c: TableColumn<T>) => sized[c.id] ?? (/^\d+(\.\d+)?px$/.test(c.width ?? '') ? Number.parseFloat(c.width as string) : FLEX_WIDTH);
  const tracks = columns.length + (selection ? 1 : 0);
  const minWidth = columns.reduce((sum, c) => sum + pixels(c), 0) + (selection ? CHECK : 0) + GAP * (tracks - 1) + PAD * 2;

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

  // Picking: one, a run from the last one picked (Shift), all of them.
  const picked = selection?.selected;
  const allPicked = keys.length > 0 && keys.every((k) => picked?.has(k));
  const somePicked = !allPicked && keys.some((k) => picked?.has(k));
  const pick = (key: string, run: boolean) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    const on = !next.has(key);
    const from = run && anchor.current !== undefined ? keys.indexOf(anchor.current) : -1;
    const to = keys.indexOf(key);
    const span = from >= 0 ? keys.slice(Math.min(from, to), Math.max(from, to) + 1) : [key];
    for (const k of span) {
      if (on) next.add(k);
      else next.delete(k);
    }
    anchor.current = key;
    selection.onChange(next);
  };
  const pickAll = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const k of keys) {
      if (allPicked) next.delete(k);
      else next.add(k);
    }
    selection.onChange(next);
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
      {selection && <div class="uk-table-pick" />}
      {columns.map((c) => (
        <div key={c.id} {...sortable.item(c.id)}>
          <Skeleton width={`${55 + ((i * 37 + c.id.length * 13) % 40)}%`} />
        </div>
      ))}
    </div>
  );
  const leavingPlaceholders = fold ? Array.from({ length: PLACEHOLDERS - fold.from }, (_, i) => placeholder(fold.from + i, true)) : [];

  // The rows drawn: those in view, and those leaving among them (before the row that followed them).
  type Drawn = { row: T; key: string; index: number; gone?: Leaving<T> };
  const drawnRows: Drawn[] = sorted.slice(first, last).map((row, n) => ({ row, key: keys[first + n], index: first + n }));
  for (const l of leaving) {
    const at = l.before === undefined ? -1 : drawnRows.findIndex((d) => d.key === l.before);
    // Its follower out of view (or it was the last, and the last is drawn): where it would be; else not drawn.
    if (at >= 0) drawnRows.splice(at, 0, { row: l.row, key: l.key, index: -1, gone: l });
    else if (l.before === undefined && last === keys.length) drawnRows.push({ row: l.row, key: l.key, index: -1, gone: l });
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
      drawn: new Map(drawnRows.filter((d) => !d.gone).map((d) => [d.key, { row: d.row, height: rowEls.current.get(d.key)?.offsetHeight || rowHeight }])),
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
      ref={sortable.root as Ref<HTMLDivElement>}
      role="table"
      aria-rowcount={waiting ? -1 : sorted.length + 1}
      aria-busy={waiting ? true : undefined}
      data-resizing={resizing !== undefined ? '' : undefined}
    >
      <div class="uk-table-body" ref={attach} style={{ maxHeight: height }} onScroll={(e) => setScroll((e.currentTarget as HTMLDivElement).scrollTop)}>
        <div class="uk-table-inner" style={{ minWidth: `${minWidth}px` }}>
          {/* biome-ignore lint/a11y/useFocusableInteractive: the header row is not a stop; its buttons are. */}
          <div class="uk-table-head" role="row" aria-rowindex={1} ref={head} style={{ gridTemplateColumns: template }}>
            {selection && (
              // biome-ignore lint/a11y/useFocusableInteractive: a header cell is not a stop; its button and its edge are.
              <div class="uk-table-th uk-table-pick" role="columnheader">
                <input
                  type="checkbox"
                  aria-label={selection.label}
                  checked={allPicked}
                  ref={(el) => {
                    if (el) el.indeterminate = somePicked;
                  }}
                  onChange={pickAll}
                />
              </div>
            )}
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
                  aria-sort={on ? (sort?.desc ? 'descending' : 'ascending') : c.sort ? 'none' : undefined}
                  data-resizing={resizing === c.id ? '' : undefined}
                >
                  <button
                    type="button"
                    id={`${ids.header}-${c.id}`}
                    aria-label={c.label}
                    data-sorted={on ? (sort?.desc ? 'desc' : 'asc') : undefined}
                    disabled={!c.sort && !reorderable}
                    {...(reorderable ? sortable.handle(c.id) : {})}
                    onClick={() => c.sort && setSort(on ? { id: c.id, desc: !sort?.desc } : { id: c.id })}
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
          ) : sorted.length === 0 ? (
            <>
              {leavingPlaceholders.length > 0 && <div role="rowgroup">{leavingPlaceholders}</div>}
              <div class="uk-table-empty">{empty}</div>
            </>
          ) : (
            <div role="rowgroup" style={{ paddingTop: `${starts[first]}px`, paddingBottom: `${starts[keys.length] - starts[last]}px` }}>
              {drawnRows.map(({ row, key, index, gone }) => {
                const on = picked?.has(key) ?? false;
                if (gone) {
                  return (
                    <div
                      key={key}
                      class="uk-table-row"
                      data-leaving=""
                      aria-hidden="true"
                      style={{ gridTemplateColumns: template, minHeight: `${rowHeight}px`, '--uk-row-h': `${gone.height}px` }}
                    >
                      {selection && <div class="uk-table-pick" />}
                      {columns.map((c) => (
                        <div key={c.id} {...sortable.item(c.id)} data-wrap={c.wrap ? '' : undefined}>
                          {c.cell(row)}
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
                    aria-selected={selection ? on : undefined}
                    data-clickable={onRowClick ? '' : undefined}
                    style={{ gridTemplateColumns: template, minHeight: `${rowHeight}px` }}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick && (() => onRowClick(row))}
                    onContextMenu={onRowMenu && ((e) => onRowMenu(row, e))}
                    onKeyDown={(e) => {
                      onRowMenu?.(row, e);
                      if (onRowClick && e.target === e.currentTarget && e.key === 'Enter') onRowClick(row);
                    }}
                  >
                    {selection && (
                      // biome-ignore lint/a11y/useKeyWithClickEvents: it only keeps a click on the check from being the row's.
                      <div role="cell" class="uk-table-pick" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={key} checked={on} onClick={(e) => pick(key, e.shiftKey)} />
                      </div>
                    )}
                    {columns.map((c) => (
                      <div key={c.id} {...sortable.item(c.id)} role="cell" data-wrap={c.wrap ? '' : undefined}>
                        {c.cell(row)}
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
