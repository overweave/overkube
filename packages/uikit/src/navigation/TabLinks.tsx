import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { Icon } from '../display/Icon';
import { TAB_LABELS, type TabLabels } from './Tab';
import { closeFocused, type StripSection, TabStrip } from './TabStrip';
import { lookIn } from './tabState';

/*
 * Tabs that are links: a page's navigation drawn as a strip of tabs — each
 * a link (opened in a new tab too, its address copied), the one the page is
 * at marked (aria-current), not a tablist (no panel of its own: the page
 * is). The strip is Tabs' (TabStrip): sections, the bar, dragging (into the
 * pinned: pinned; into the open: unpinned). An open one's × closes it (Delete
 * too). What follows them (a +) at their end.
 */

export interface TabLink {
  key: string;
  label: ComponentChildren;
  href: string;
  /** What it is, in full (a tooltip; the tools' names say it). */
  title?: string;
  /** Shown as not kept (one open, not pinned). */
  transient?: boolean;
  closable?: boolean;
  /** Dragged, it stays in its section. */
  stays?: boolean;
}

export interface TabLinksProps {
  sections: StripSection<TabLink>[];
  /** The one the page is at. */
  current?: string;
  /** What it is, for those who cannot see it ("Kinds"). */
  label: string;
  /** A link chosen (none: it is followed). */
  onOpen?: (link: TabLink, event: MouseEvent) => void;
  onClose?: (key: string) => void;
  /** A link's context menu asked for (a right click, the menu key): the page's to open, or not (the browser's then). */
  onMenu?: (key: string, event: MouseEvent | KeyboardEvent) => void;
  /** A link dragged to another place: into section, at index (among its links, as they will be). */
  onMove?: (key: string, section: string, index: number) => void;
  /** The name of its × ("Close Pods"). */
  labels?: Pick<TabLabels, 'close'>;
  end?: ComponentChildren;
}

export function TabLinks({ sections, current, label, onOpen, onClose: onCloseGiven, onMenu, onMove, labels = TAB_LABELS, end }: TabLinksProps) {
  const strip = useRef<HTMLDivElement | null>(null);
  const onClose = onCloseGiven && ((key: string) => closeFocused(strip.current, key, onCloseGiven));
  /** A tool's click: its own, not the link's. */
  const tool = (run: () => void) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    run();
  };
  return (
    <nav class="uk-tabs" aria-label={label}>
      <TabStrip
        sections={sections}
        active={current}
        listRef={strip}
        onMove={onMove}
        tab={(given, drag, into) => {
          const link = into ? lookIn(given, into) : given;
          const name = link.title ?? link.key;
          const closes = link.closable && onClose;
          return (
            <a
              {...drag}
              class="uk-tab"
              href={link.href}
              title={link.title}
              data-key={link.key}
              data-transient={link.transient ? '' : undefined}
              data-tool={closes ? 'close' : undefined}
              data-into={into}
              aria-current={current === link.key ? 'page' : undefined}
              aria-keyshortcuts={[closes && 'Delete', drag['aria-keyshortcuts']].filter(Boolean).join(' ') || undefined}
              onClick={onOpen ? (e) => onOpen(link, e) : undefined}
              onContextMenu={onMenu && ((e) => onMenu(link.key, e))}
              onKeyDown={(e) => {
                (drag.onKeyDown as ((e: KeyboardEvent) => void) | undefined)?.(e);
                onMenu?.(link.key, e);
                if (e.defaultPrevented || !closes || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
                e.preventDefault();
                onClose(link.key);
              }}
            >
              <span class="uk-tab-label">{link.label}</span>
              {closes && (
                <span class="uk-tab-close" aria-hidden="true" title={labels.close(name)} onClick={tool(() => onClose(link.key))}>
                  <Icon name="x" />
                </span>
              )}
            </a>
          );
        }}
      />
      {end}
    </nav>
  );
}
