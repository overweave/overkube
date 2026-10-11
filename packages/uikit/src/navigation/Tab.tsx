import type { ComponentChildren, JSX } from 'preact';
import { Icon } from '../display/Icon';
import type { Level } from '../lib/level';

/*
 * One tab of a strip: its name; a dot of how what it shows is; and the ×
 * of a closable one, in room kept for it, shown under the pointer and on
 * the selected tab. ARIA allows nothing interactive in a tab: the × is the
 * pointer's (a tooltip names it); the keyboard closes by Delete. Enter or Space selects it; a middle click closes it.
 */

export interface TabItem {
  key: string;
  label: ComponentChildren;
  /** What it is, in full (a tooltip; the tools' names say it). */
  title?: string;
  dot?: Level;
  /** Shown as not kept (an open tab, not pinned). */
  transient?: boolean;
  closable?: boolean;
  /** Dragged, it stays in its section (a page's own: pinned for good). */
  stays?: boolean;
}

/** The names of a tab's tools and dot, for those who cannot see them. */
export interface TabLabels {
  close: (title: string) => string;
  /** How it is, by its dot ("needs a look"); without, the dot is not said. */
  dot?: (level: Level) => string;
}

export const TAB_LABELS: TabLabels = { close: (t) => `Close ${t}` };

export type TabProps = {
  tab: TabItem;
  selected?: boolean;
  /** The one tab stop of its strip. */
  stop?: boolean;
  /** The panel it shows (when selected). */
  panel?: string;
  labels?: TabLabels;
  onSelect: (key: string) => void;
  onClose?: (key: string) => void;
} & Omit<JSX.HTMLAttributes<HTMLDivElement>, 'onSelect' | 'onClose' | 'tab' | 'label'>;

export function Tab({ tab, selected = false, stop = selected, panel, labels = TAB_LABELS, onSelect, onClose, onKeyDown, ...rest }: TabProps) {
  const name = tab.title ?? tab.key;
  const closes = tab.closable && onClose;
  // Its own keys, and those it is given (moving it: Alt and the arrows).
  const keys = [closes && 'Delete', rest['aria-keyshortcuts']].filter(Boolean).join(' ');
  return (
    <div
      {...rest}
      role="tab"
      class="uk-tab"
      data-tab={tab.key}
      data-key={tab.key}
      data-transient={tab.transient ? '' : undefined}
      data-tool={closes ? 'close' : undefined}
      aria-selected={selected}
      aria-controls={selected ? panel : undefined}
      aria-keyshortcuts={keys || undefined}
      tabIndex={stop ? 0 : -1}
      title={tab.title}
      onClick={() => onSelect(tab.key)}
      onAuxClick={(e) => {
        if (e.button === 1 && closes) onClose(tab.key);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === 'Enter' || e.key === ' ') onSelect(tab.key);
        else if ((e.key === 'Delete' || e.key === 'Backspace') && closes) onClose(tab.key);
        else return;
        e.preventDefault();
      }}
    >
      <span class="uk-tab-label">{tab.label}</span>
      {tab.dot &&
        tab.dot !== 'ok' &&
        (labels.dot ? <span class="uk-dot" data-level={tab.dot} role="img" aria-label={labels.dot(tab.dot)} /> : <span class="uk-dot" data-level={tab.dot} aria-hidden="true" />)}
      {closes && (
        <span
          class="uk-tab-close"
          aria-hidden="true"
          title={labels.close(name)}
          onClick={(e) => {
            e.stopPropagation();
            onClose(tab.key);
          }}
        >
          <Icon name="x" />
        </span>
      )}
    </div>
  );
}
