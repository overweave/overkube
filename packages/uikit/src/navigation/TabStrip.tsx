import { type ComponentChildren, Fragment, type JSX, type Ref } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { activeElement } from '../lib/focus';
import { useSortable } from '../lib/sortable';

/*
 * What Tabs and TabLinks share: a strip of tabs in sections (pinned, open —
 * as a browser's), a divider where two meet, a bar under the active one
 * that slides to the next. The tabs of the draggable sections are one row
 * to drag in (useSortable: lifted, leaning, the others moving aside on
 * springs): a tab dragged past the divider of two sections is in the next;
 * one that stays (a page's own) moves only within its own. What each tab
 * is (a tab of a tablist, a link) is the caller's: it draws each, given what
 * makes it draggable.
 */

export interface StripTab {
  key: string;
  /** Dragged, it stays in its section (a page's own: pinned for good). */
  stays?: boolean;
  /** Shown as not kept (the bar is measured again as it changes). */
  transient?: boolean;
}

export interface StripSection<T extends StripTab> {
  id: string;
  tabs: T[];
  draggable?: boolean;
}

export interface TabStripProps<T extends StripTab> {
  sections: StripSection<T>[];
  /** The tab the bar is under. */
  active?: string;
  /** A tab dragged to another place: into section, at index (among its tabs, as they will be). */
  onMove?: (key: string, section: string, index: number) => void;
  /** The list's own attributes (a tablist's role, its name, its keys). */
  list?: Omit<JSX.HTMLAttributes<HTMLDivElement>, 'ref' | 'class'>;
  /** The list element, for the caller (its tabs, to focus). */
  listRef?: Ref<HTMLDivElement>;
  /**
   * A tab drawn: given what makes it draggable (none where its section is
   * not); the one dragged, the section it would land in now, if another
   * (drawn as it will be there).
   */
  tab: (tab: T, drag: Record<string, unknown>, into?: string) => ComponentChildren;
}

/** The divider before a draggable section, as an item of the row dragged in. */
const DIVIDER = '|divider:';
/** How much narrower than its tab the bar is, each side (px). */
const BAR_INSET = 12;

/**
 * One closed with focus on it (its element gone): focus to its neighbour —
 * the right one, as a browser does, else the left.
 */
export function closeFocused(list: HTMLElement | null, key: string, close: (key: string) => void) {
  const tabs = [...(list?.querySelectorAll<HTMLElement>('.uk-tab[data-key]') ?? [])];
  const at = tabs.findIndex((t) => t.dataset.key === key);
  const had = at >= 0 && activeElement() === tabs[at];
  close(key);
  if (had) (tabs[at + 1] ?? tabs[at - 1])?.focus();
}

/** The order with one put at another place. */
function placed(ids: readonly string[], key: string, at: number): string[] {
  const next = ids.filter((id) => id !== key);
  next.splice(at, 0, key);
  return next;
}

/** Where one is in an order: the section whose divider it comes after (the first, before any), its place among that section's tabs. */
function landing(order: readonly string[], key: string, first: string | undefined): [string | undefined, number] {
  let section = first;
  let index = 0;
  for (const id of order) {
    if (id === key) break;
    if (id.startsWith(DIVIDER)) {
      section = id.slice(DIVIDER.length);
      index = 0;
    } else index++;
  }
  return [section, index];
}

export function TabStrip<T extends StripTab>({ sections, active, onMove, list, listRef, tab }: TabStripProps<T>) {
  const strip = useRef<HTMLDivElement | null>(null);
  const [bar, setBar] = useState<{ x: number; y: number; width: number } | null>(null);
  const all = sections.flatMap((s) => s.tabs);

  // The row dragged in: the draggable sections' tabs, a divider before each but the first; and where each section's part of it is.
  const draggable = onMove ? sections.filter((s) => s.draggable) : [];
  const ids: string[] = [];
  const spans = new Map<string, [number, number]>();
  draggable.forEach((s, i) => {
    if (i > 0) ids.push(DIVIDER + s.id);
    spans.set(s.id, [ids.length, ids.length + s.tabs.length - 1]);
    ids.push(...s.tabs.map((t) => t.key));
  });
  const sectionOf = new Map(draggable.flatMap((s) => s.tabs.map((t) => [t.key, s] as const)));
  const sortable = useSortable({
    ids,
    scroller: strip,
    disabled: !onMove,
    swap: 'edge',
    tilt: true,
    duration: 420,
    // One that stays: within its section's part of the row.
    bounds: (key) => {
      const s = sectionOf.get(key);
      return s?.tabs.find((t) => t.key === key)?.stays ? spans.get(s.id) : undefined;
    },
    onMove: (next, key) => {
      const [section, index] = landing(next, key, draggable[0]?.id);
      if (section) onMove?.(key, section, index);
    },
  });
  // The one dragged: the section it would land in now.
  const moving = sortable.active;
  const over = moving !== undefined && sortable.over !== undefined ? landing(placed(ids, moving, sortable.over), moving, draggable[0]?.id)[0] : undefined;

  // A tab dropped: the bar is under the active one at once, where it now is (not sliding there from where it was).
  const [instant, setInstant] = useState(false);
  const sorting = useRef<string>();
  useLayoutEffect(() => {
    if (sorting.current && !sortable.active) {
      setInstant(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)));
    }
    sorting.current = sortable.active;
  }, [sortable.active]);

  // The bar: under the active tab (on whichever line it is), sliding as it changes (and as the strip changes size).
  useLayoutEffect(() => {
    const root = strip.current;
    if (!root) return;
    const place = () => {
      const el = active ? root.querySelector<HTMLElement>(`[data-key="${CSS.escape(active)}"]`) : null;
      // A little narrower than the tab, under its middle.
      const inset = el ? Math.min(BAR_INSET, el.offsetWidth / 4) : 0;
      setBar(el ? { x: el.offsetLeft + inset, y: el.offsetTop + el.offsetHeight, width: el.offsetWidth - 2 * inset } : null);
    };
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(place);
    observer.observe(root);
    return () => observer.disconnect();
  }, [active, all.map((t) => `${t.key}${t.transient}`).join(',')]);

  // Where sections meet, a divider: seen while tabs are on both sides of it (or while dragging, to drop past it).
  const before = (i: number) => sections.slice(0, i).some((s) => s.tabs.length > 0);
  const moves = (s: StripSection<T>) => draggable.includes(s);
  return (
    <div
      {...list}
      class="uk-tab-list"
      ref={(el) => {
        strip.current = el;
        sortable.root.current = el;
        if (typeof listRef === 'function') listRef(el);
        else if (listRef) listRef.current = el;
      }}
    >
      {sections.map((section, s) => {
        const item = moves(section) && draggable[0] !== section;
        const shown = s > 0 && before(s) && section.tabs.length > 0;
        return (
          <Fragment key={section.id}>
            {(item || shown) && (
              <span key={`sep-${section.id}`} class="uk-tab-sep" aria-hidden="true" data-quiet={shown ? undefined : ''} {...(item ? sortable.item(DIVIDER + section.id) : {})} />
            )}
            {section.tabs.map((t) => (
              <Fragment key={t.key}>
                {tab(t, moves(section) ? { ...sortable.item(t.key), ...sortable.handle(t.key) } : {}, t.key === moving && over !== section.id ? over : undefined)}
              </Fragment>
            ))}
          </Fragment>
        );
      })}
      {bar && (
        <span class="uk-tab-bar" aria-hidden="true" data-instant={instant ? '' : undefined} style={{ transform: `translate(${bar.x}px, ${bar.y}px)`, width: `${bar.width}px` }} />
      )}
    </div>
  );
}
