import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { TAB_LABELS, Tab, type TabItem, type TabLabels } from './Tab';
import { closeFocused, type StripSection, TabStrip } from './TabStrip';
import { lookIn } from './tabState';

/*
 * A strip of tabs in sections (TabStrip: dividers, the bar, dragging — into
 * the pinned: pinned; into the open: unpinned), as ARIA tabs: one tab stop
 * (the active tab); arrows, Home and End move along; what a tab does itself
 * is its own (Tab). Alt and the arrows move the focused one. What follows
 * the tabs (a +) is not in the tab list.
 */

export type { TabItem } from './Tab';

export type TabSection = StripSection<TabItem>;

export interface TabsProps {
  sections: TabSection[];
  active?: string;
  label: string;
  onSelect: (key: string) => void;
  onClose?: (key: string) => void;
  /** A tab dragged to another place: into section, at index (among its tabs, as they will be). */
  onMove?: (key: string, section: string, index: number) => void;
  /** The names of a tab's tools and dot, for those who cannot see them. */
  labels?: TabLabels;
  /** The panel the tabs show (the active one says it controls it). */
  panel?: string;
  /** Drawn after the tabs, outside the tab list (a + button). */
  end?: ComponentChildren;
}

export function Tabs({ sections, active, label, onSelect, onClose, onMove, labels = TAB_LABELS, panel, end }: TabsProps) {
  const strip = useRef<HTMLDivElement | null>(null);
  const all = sections.flatMap((s) => s.tabs);
  const stop = all.some((t) => t.key === active) ? active : all[0]?.key;

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
  const close = onClose && ((key: string) => closeFocused(strip.current, key, onClose));

  return (
    <div class="uk-tabs">
      <TabStrip
        sections={sections}
        active={active}
        onMove={onMove}
        listRef={strip}
        list={{ role: 'tablist', 'aria-label': label, onKeyDown: keys }}
        tab={(tab, drag, into) => (
          <Tab
            tab={into ? lookIn(tab, into) : tab}
            selected={tab.key === active}
            stop={tab.key === stop}
            panel={panel}
            labels={labels}
            onSelect={onSelect}
            onClose={close}
            data-into={into}
            {...drag}
          />
        )}
      />
      {end}
    </div>
  );
}
