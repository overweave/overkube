import { useEffect, useRef, useState } from 'preact/hooks';

/*
 * Putting things of a row (or a column) in another order by dragging them,
 * with what is dragged following the pointer and the others moving aside
 * as it passes them. An item may be drawn as many elements (a table's
 * column: its header and a cell in each row): each is moved by a CSS
 * variable on the root (--uk-sort-<index>), so nothing is drawn again while
 * dragging, and an element drawn meanwhile (a row scrolled to) is where it
 * should be at once. The order is given once it is dropped. A press that
 * moves less than a few pixels is a click as before. Alt and the arrows
 * move the focused one by one; Escape puts a drag back.
 *
 * The page gives the root (sortable.root), every element of an item
 * (sortable.item(id)) and what is taken hold of (sortable.handle(id)); the
 * CSS moving them is the kit's ([data-sorting]). An item with no handle (a
 * divider between groups) is not taken hold of, but moves aside as the
 * others do: one dragged past it is in the next group.
 */

export interface SortableOptions {
  /** The items, in their order. */
  ids: readonly string[];
  /** The new order, once dropped; and which one moved. */
  onMove: (ids: string[], moved: string) => void;
  /** A row (x) or a column (y). */
  axis?: 'x' | 'y';
  /** What scrolls, scrolled along near its edges while dragging. */
  scroller?: { current: HTMLElement | null };
  /** How far a press moves before it is a drag (px). */
  threshold?: number;
  /** How long things take to move aside (ms); none under prefers-reduced-motion. */
  duration?: number;
  disabled?: boolean;
  /** Where an item may go (first and last place, inclusive): one kept in its group. */
  bounds?: (id: string) => readonly [number, number] | undefined;
}

interface Drag {
  id: string;
  from: number;
  to: number;
  /** Each item's start and size along the axis, as they were taken hold of. */
  boxes: { start: number; size: number }[];
  gap: number;
  /** Where the pointer was pressed, and the scroller then. */
  origin: number;
  scrolled: number;
  pointer: number;
  started: boolean;
  frame?: number;
  /** How far the scroller could scroll when it was taken hold of: no further (what is dragged, moved, makes it wider). */
  reach?: number;
}

/** How near an edge of the scroller the pointer scrolls it, and how fast at the edge (px a frame). */
const EDGE = 40;
const SPEED = 14;

export function useSortable(options: SortableOptions) {
  const { axis = 'x', threshold = 4, duration = 200 } = options;
  const [active, setActive] = useState<string>();
  const root = useRef<HTMLElement | null>(null);
  const opts = useRef(options);
  opts.current = options;
  const drag = useRef<Drag>();
  /** Something is moving (a drag, a drop, a move by the keyboard): nothing else starts till it is done. */
  const busy = useRef(false);
  const stop = useRef<() => void>();
  useEffect(() => () => stop.current?.(), []);

  const ms = () => (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : duration);
  const along = (r: DOMRect) => (axis === 'x' ? { start: r.left, size: r.width } : { start: r.top, size: r.height });
  const at = (e: PointerEvent) => (axis === 'x' ? e.clientX : e.clientY);
  const scrollOf = () => {
    const s = opts.current.scroller?.current;
    return s ? (axis === 'x' ? s.scrollLeft : s.scrollTop) : 0;
  };
  const set = (i: number, px: number) => root.current?.style.setProperty(`--uk-sort-${i}`, `${px}px`);

  /**
   * Every item's box along the axis, by its first element (a column's
   * header); or none, if one is not drawn. The gap: the narrowest between
   * two (one beside a divider is wider).
   */
  const measure = () => {
    const el = root.current;
    if (!el) return undefined;
    const boxes = opts.current.ids.map((id) => el.querySelector(`[data-sort-id="${CSS.escape(id)}"]`));
    if (boxes.some((b) => !b)) return undefined;
    const rects = boxes.map((b) => along((b as Element).getBoundingClientRect()));
    const gaps = rects.slice(1).map((r, i) => r.start - rects[i].start - rects[i].size);
    return { boxes: rects, gap: Math.max(0, Math.min(...gaps, Number.POSITIVE_INFINITY)) || 0 };
  };

  /**
   * Where the others stand with the one taken from `from` put at `to` (aside
   * by its size and the gap); and where it lands put there: its end where
   * the last one passed ended (later), its start where the first one passed
   * started (earlier) — as they stand, dividers and all.
   */
  const place = (d: Pick<Drag, 'from' | 'to' | 'boxes' | 'gap'>) => {
    const by = d.boxes[d.from].size + d.gap;
    d.boxes.forEach((_, i) => {
      if (i === d.from) return;
      set(i, d.from < d.to && i > d.from && i <= d.to ? -by : d.to < d.from && i >= d.to && i < d.from ? by : 0);
    });
    const [f, t] = [d.boxes[d.from], d.boxes[d.to]];
    return d.to > d.from ? t.start + t.size - (f.start + f.size) : d.to < d.from ? t.start - f.start : 0;
  };

  const begin = (d: Drag) => {
    const el = root.current;
    if (!el) return;
    el.style.setProperty('--uk-sort-ms', `${ms()}ms`);
    el.setAttribute('data-sorting', axis);
    busy.current = true;
    setActive(d.id);
  };

  /** Moved to `to` (the drop, or back where it was): it goes there, then the order is given and the moving is taken away. */
  const end = (d: Drag, commit: boolean) => {
    const el = root.current;
    if (!el) {
      busy.current = false;
      return;
    }
    const to = commit ? d.to : d.from;
    set(d.from, place({ ...d, to }));
    el.setAttribute('data-sort-drop', '');
    setTimeout(() => {
      // In one task with the new order drawn (Preact draws before the page is painted again): no frame of the old.
      for (let i = 0; i < d.boxes.length; i++) el.style.removeProperty(`--uk-sort-${i}`);
      el.removeAttribute('data-sorting');
      el.removeAttribute('data-sort-drop');
      busy.current = false;
      setActive(undefined);
      if (to !== d.from) {
        const ids = [...opts.current.ids];
        const [moved] = ids.splice(d.from, 1);
        ids.splice(to, 0, moved);
        // Drawn in its new place, the one that had focus may have lost it (an element moved in the DOM is blurred): given it back.
        const focused = (el.getRootNode() as Document | ShadowRoot).activeElement;
        const had = focused?.closest('[data-sort-handle]')?.getAttribute('data-sort-handle') === d.id;
        opts.current.onMove(ids, d.id);
        if (had) {
          // After Preact's draw (queued first).
          Promise.resolve().then(() => el.querySelector<HTMLElement>(`[data-sort-handle="${CSS.escape(d.id)}"]`)?.focus());
        }
      }
    }, ms());
  };

  /** The dragged one under the pointer; the others aside of where it would land. */
  const follow = (d: Drag) => {
    const delta = d.pointer - d.origin + scrollOf() - d.scrolled;
    const center = d.boxes[d.from].start + d.boxes[d.from].size / 2 + delta;
    const to = d.boxes.filter((b, i) => i !== d.from && b.start + b.size / 2 < center).length;
    const [lo, hi] = opts.current.bounds?.(d.id) ?? [0, d.boxes.length - 1];
    d.to = Math.min(hi, Math.max(lo, to));
    place(d);
    set(d.from, delta);
  };

  /** Near an edge of the scroller: scrolled, and followed again, every frame. */
  const edge = (d: Drag) => {
    const s = opts.current.scroller?.current;
    if (!s) return;
    const r = along(s.getBoundingClientRect());
    const speed = d.pointer < r.start + EDGE ? -SPEED : d.pointer > r.start + r.size - EDGE ? SPEED : 0;
    // As far as it could scroll when taken hold of, not further: the dragged one, moved, widens what it holds.
    const now = scrollOf();
    const next = Math.max(0, Math.min(d.reach ?? 0, now + speed));
    if (!speed || next === now) return;
    if (axis === 'x') s.scrollLeft = next;
    else s.scrollTop = next;
    follow(d);
    d.frame = requestAnimationFrame(() => edge(d));
  };

  const press = (id: string) => (e: PointerEvent) => {
    if (opts.current.disabled || e.button !== 0 || drag.current || busy.current) return;
    const from = opts.current.ids.indexOf(id);
    if (from < 0) return;
    const d: Drag = { id, from, to: from, boxes: [], gap: 0, origin: at(e), scrolled: scrollOf(), pointer: at(e), started: false };
    drag.current = d;
    // The click a drag ends with is not a click (a header's sort).
    const swallow = (c: Event) => {
      c.stopPropagation();
      c.preventDefault();
    };
    const move = (m: PointerEvent) => {
      d.pointer = at(m);
      if (!d.started) {
        if (Math.abs(d.pointer - d.origin) < threshold) return;
        const measured = measure();
        if (!measured) return;
        const s = opts.current.scroller?.current;
        const reach = s ? (axis === 'x' ? s.scrollWidth - s.clientWidth : s.scrollHeight - s.clientHeight) : 0;
        Object.assign(d, measured, { started: true, reach: Math.max(0, reach) });
        window.addEventListener('click', swallow, true);
        begin(d);
      }
      m.preventDefault();
      if (d.frame) cancelAnimationFrame(d.frame);
      d.frame = undefined;
      follow(d);
      edge(d);
    };
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
      if (d.frame) cancelAnimationFrame(d.frame);
      drag.current = undefined;
      stop.current = undefined;
      if (!d.started) return;
      // The click comes with the button let go (after Escape, later): swallowed till then.
      const unswallow = () => setTimeout(() => window.removeEventListener('click', swallow, true));
      if (released) unswallow();
      else window.addEventListener('pointerup', unswallow, { once: true });
      end(d, commit);
    };
    let released = false;
    const up = () => {
      released = true;
      finish(true);
    };
    const cancel = () => finish(false);
    const key = (k: KeyboardEvent) => {
      if (k.key !== 'Escape' || !d.started) return;
      k.stopPropagation();
      finish(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
    stop.current = cancel;
  };

  /** Alt and an arrow: the focused one a place earlier or later, moving as a drag would. */
  const nudge = (id: string) => (e: KeyboardEvent) => {
    if (opts.current.disabled || !e.altKey || drag.current || busy.current) return;
    const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const on = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    if (e.key !== back && e.key !== on) return;
    e.preventDefault();
    const from = opts.current.ids.indexOf(id);
    const to = from + (e.key === on ? 1 : -1);
    const measured = measure();
    const [lo, hi] = opts.current.bounds?.(id) ?? [0, opts.current.ids.length - 1];
    if (from < 0 || to < lo || to > hi || !measured) return;
    const d: Drag = { id, from, to, ...measured, origin: 0, scrolled: 0, pointer: 0, started: true };
    begin(d);
    end(d, true);
  };

  return {
    /** The one being dragged (or moved by the keyboard). */
    active,
    /** The ref for the element holding them all: the moving is set there. */
    root,
    /** Each element an item is drawn as. */
    item: (id: string) => ({
      'data-sort-id': id,
      'data-sort-active': active === id ? '' : undefined,
      style: { '--uk-sort-shift': `var(--uk-sort-${opts.current.ids.indexOf(id)}, 0px)` },
    }),
    /** What is taken hold of: pressed and moved, or Alt and an arrow. */
    handle: (id: string) => ({
      'data-sort-handle': id,
      'aria-keyshortcuts': axis === 'x' ? 'Alt+ArrowLeft Alt+ArrowRight' : 'Alt+ArrowUp Alt+ArrowDown',
      onPointerDown: press(id),
      onKeyDown: nudge(id),
    }),
  };
}
