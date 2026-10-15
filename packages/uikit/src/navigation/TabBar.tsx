import { useRef } from 'preact/hooks';
import { Icon } from '../display/Icon';

/*
 * Tabs over what they show (a view's parts: a resource's Overview, its YAML):
 * each its icon and name, the one shown underlined. ARIA tabs: one tab stop
 * (the one shown); arrows, Home and End move along and show it. Not the
 * navigation's (Tabs): none closed, moved or pinned.
 */

export interface TabBarTab {
  key: string;
  label: string;
  icon?: string;
}

export interface TabBarProps {
  tabs: readonly TabBarTab[];
  /** The one shown (none, or not among them: the first). */
  active?: string;
  onSelect: (key: string) => void;
  /** What they are, for those who cannot see them. */
  label: string;
  /** The panel they show (the shown one says it controls it); each tab's id, <panel>-<key> (the panel labelled by the one shown). */
  panel?: string;
}

export function TabBar({ tabs, active, onSelect, label, panel }: TabBarProps) {
  const bar = useRef<HTMLDivElement>(null);
  const shown = tabs.some((t) => t.key === active) ? active : tabs[0]?.key;
  const keys = (e: KeyboardEvent) => {
    const at = tabs.findIndex((t) => t.key === shown);
    const next =
      e.key === 'ArrowRight'
        ? (at + 1) % tabs.length
        : e.key === 'ArrowLeft'
          ? (at - 1 + tabs.length) % tabs.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : -1;
    const tab = tabs[next];
    if (!tab) return;
    e.preventDefault();
    onSelect(tab.key);
    bar.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };
  return (
    <div class="uk-tabbar" role="tablist" aria-label={label} ref={bar} onKeyDown={keys}>
      {tabs.map((t) => (
        <button
          key={t.key}
          id={panel && `${panel}-${t.key}`}
          type="button"
          role="tab"
          class="uk-tabbar-tab"
          aria-selected={t.key === shown}
          aria-controls={t.key === shown ? panel : undefined}
          tabIndex={t.key === shown ? 0 : -1}
          onClick={() => onSelect(t.key)}
        >
          {t.icon && <Icon name={t.icon} />}
          {t.label}
        </button>
      ))}
    </div>
  );
}
