import { type ComponentChildren, Fragment } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { activeElement } from '../lib/focus';
import { useSortable } from '../lib/sortable';
import { TAB_LABELS, Tab, type TabItem, type TabLabels } from './Tab';

/*
 * A strip of tabs in sections (pinned, open — as a browser's), with a bar
 * under the active one that slides to the next. ARIA tabs: one tab stop
 * (the active tab); arrows, Home and End move along; what a tab does itself
 * is its own (Tab). The tabs of the draggable sections are one row to drag
 * in (useSortable): a tab dragged past the divider of two sections is in
 * the next (into the pinned: pinned; into the open: unpinned); one that
 * stays (a page's own) moves only within its own. Alt and the arrows move
 * the focused one. What follows the tabs (a +) is not in the tab list.
 */

export type { TabItem } from './Tab';

export interface TabSection {
  id: string;
  tabs: TabItem[];
  draggable?: boolean;
}

export interface TabsProps {
  sections: TabSection[];
  active?: string;
  label: string;
  onSelect: (key: string) => void;
  onClose?: (key: string) => void;
  onPin?: (key: string, pin: boolean) => void;
  /** A tab dragged to another place: into section, at index (among its tabs, as they will be). */
  onMove?: (key: string, section: string, index: number) => void;
  /** The names of a tab's tools and dot, for those who cannot see them. */
  labels?: TabLabels;
  /** The panel the tabs show (the active one says it controls it). */
  panel?: string;
  /** Drawn after the tabs, outside the tab list (a + button). */
  end?: ComponentChildren;
}

/** The divider before a draggable section, as an item of the row dragged in. */
const DIVIDER = '|divider:';

export function Tabs({ sections, active, label, onSelect, onClose, onPin, onMove, labels = TAB_LABELS, panel, end }: TabsProps) {
  const strip = useRef<HTMLDivElement | null>(null);
  const [bar, setBar] = useState<{ x: number; y: number; width: number } | null>(null);
  const all = sections.flatMap((s) => s.tabs);
  const stop = all.some((t) => t.key === active) ? active : all[0]?.key;

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
    // One that stays: within its section's part of the row.
    bounds: (key) => {
      const s = sectionOf.get(key);
      return s?.tabs.find((t) => t.key === key)?.stays ? spans.get(s.id) : undefined;
    },
    onMove: (next, key) => {
      // Its section: the one whose divider it comes after (the first, before any); its place among that section's tabs.
      let section = draggable[0]?.id;
      let index = 0;
      for (const id of next) {
        if (id === key) break;
        if (id.startsWith(DIVIDER)) {
          section = id.slice(DIVIDER.length);
          index = 0;
        } else index++;
      }
      if (section) onMove?.(key, section, index);
    },
  });

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
      const tab = active ? root.querySelector<HTMLElement>(`[data-tab="${CSS.escape(active)}"]`) : null;
      setBar(tab ? { x: tab.offsetLeft, y: tab.offsetTop + tab.offsetHeight, width: tab.offsetWidth } : null);
    };
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(place);
    observer.observe(root);
    return () => observer.disconnect();
  }, [active, all.map((t) => `${t.key}${t.transient}`).join(',')]);

  const tabs = () => [...(strip.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
  const keys = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey) return;
    const list = tabs();
    const at = list.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (at + 1) % list.length;
    else if (e.key === 'ArrowLeft') next = (at - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else return;
    e.preventDefault();
    list[next]?.focus();
  };
  // A tab closed with focus on it: focus to its neighbour (the right one, as a browser does).
  const close =
    onClose &&
    ((key: string) => {
      const list = tabs();
      const at = list.findIndex((t) => t.dataset.key === key);
      const had = at >= 0 && activeElement() === list[at];
      onClose(key);
      if (had) (list[at + 1] ?? list[at - 1])?.focus();
    });

  // A tab pinned or unpinned with focus on it moves to the other section (its element moved, blurred): focus back on it, where it now is.
  const pin =
    onPin &&
    ((key: string, on: boolean) => {
      const had = activeElement() === tabs().find((t) => t.dataset.key === key);
      onPin(key, on);
      if (had)
        Promise.resolve().then(() =>
          tabs()
            .find((t) => t.dataset.key === key)
            ?.focus(),
        );
    });

  // Where sections meet, a divider: seen while tabs are on both sides of it (or while dragging, to drop past it).
  const before = (i: number) => sections.slice(0, i).some((s) => s.tabs.length > 0);
  const moves = (s: TabSection) => draggable.includes(s);
  return (
    <div class="uk-tabs">
      <div
        class="uk-tab-list"
        role="tablist"
        aria-label={label}
        ref={(el) => {
          strip.current = el;
          sortable.root.current = el;
        }}
        onKeyDown={keys}
      >
        {sections.map((section, s) => {
          const item = moves(section) && draggable[0] !== section;
          const shown = s > 0 && before(s) && section.tabs.length > 0;
          return (
            <Fragment key={section.id}>
              {(item || shown) && (
                <span key={`sep-${section.id}`} class="uk-tab-sep" aria-hidden="true" data-quiet={shown ? undefined : ''} {...(item ? sortable.item(DIVIDER + section.id) : {})} />
              )}
              {section.tabs.map((tab) => (
                <Tab
                  key={tab.key}
                  tab={tab}
                  selected={tab.key === active}
                  stop={tab.key === stop}
                  panel={panel}
                  labels={labels}
                  onSelect={onSelect}
                  onClose={close}
                  onPin={pin}
                  {...(moves(section) ? { ...sortable.item(tab.key), ...sortable.handle(tab.key) } : {})}
                />
              ))}
            </Fragment>
          );
        })}
        {bar && (
          <span class="uk-tab-bar" aria-hidden="true" data-instant={instant ? '' : undefined} style={{ transform: `translate(${bar.x}px, ${bar.y}px)`, width: `${bar.width}px` }} />
        )}
      </div>
      {end}
    </div>
  );
}
