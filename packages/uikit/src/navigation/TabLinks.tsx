import type { ComponentChildren, JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { Icon } from '../display/Icon';
import { Tip } from '../overlays/Tip';
import { TAB_LABELS, type TabLabels } from './Tab';
import { closeFocused, type StripSection, TabStrip } from './TabStrip';
import { lookIn } from './tabState';

/*
 * Tabs that are links: a page's navigation drawn as a strip of tabs — each
 * a link (opened in a new tab too, its address copied), the one the page is
 * at marked (aria-current), not a tablist (no panel of its own: the page
 * is). The strip is Tabs' (TabStrip): sections, the bar, dragging (into the
 * pinned: pinned; into the open: unpinned). An open one's × closes it (Delete
 * too). What follows them (a +) at their end. Across a page's top, or
 * down its side (vertical: each with its icon — none, its name's first
 * letter — for when only icons are seen). A tab may be drawn by the page
 * (render): given all it does (its attrs, for its element) and its ×.
 */

export interface TabLink {
  key: string;
  label: ComponentChildren;
  href: string;
  /** What it is, in full (the tools' names say it; no tip — its name is seen, down a side too: the side opens under the pointer). */
  title?: string;
  /** Shown as not kept (one open, not pinned). */
  transient?: boolean;
  closable?: boolean;
  /** Dragged, it stays in its section. */
  stays?: boolean;
  /** Its icon, down a side (none: its name's first letter). */
  icon?: string;
}

/** What a tab drawn by the page is given: all it does, for its element (a link: href, state, keys, menu, dragging), and its × (none: not closable). */
export interface TabParts {
  attrs: JSX.HTMLAttributes<HTMLAnchorElement> & Record<string, unknown>;
  close: ComponentChildren;
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
  /** A tab drawn by the page: its element given its parts' attrs (none: the kit's link, its label in it). */
  render?: (link: TabLink, parts: TabParts) => ComponentChildren;
  end?: ComponentChildren;
  /** Across (the default) or down a side. */
  orientation?: 'horizontal' | 'vertical';
}

/** A tab's mark down a side (what is seen of it collapsed): its icon, or its name's first letter. */
export function TabMark({ icon, name }: { icon?: string; name: string }) {
  return (
    <span class="uk-tab-mark" aria-hidden="true">
      {icon ? <Icon name={icon} /> : ([...name][0] ?? '').toLocaleUpperCase()}
    </span>
  );
}

export function TabLinks({ sections, current, label, onOpen, onClose: onCloseGiven, onMenu, onMove, labels = TAB_LABELS, render, end, orientation = 'horizontal' }: TabLinksProps) {
  const strip = useRef<HTMLDivElement | null>(null);
  const onClose = onCloseGiven && ((key: string) => closeFocused(strip.current, key, onCloseGiven));
  /** A tool's click: its own, not the link's. */
  const tool = (run: () => void) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    run();
  };
  return (
    <nav class="uk-tabs" aria-label={label} data-orientation={orientation}>
      <TabStrip
        sections={sections}
        active={current}
        listRef={strip}
        onMove={onMove}
        orientation={orientation}
        tab={(given, drag, into) => {
          const link = into ? lookIn(given, into) : given;
          const name = link.title ?? link.key;
          const closes = link.closable && onClose;
          const attrs: TabParts['attrs'] = {
            ...drag,
            href: link.href,
            'data-tab': link.key,
            'data-transient': link.transient ? '' : undefined,
            'data-tool': closes ? 'close' : undefined,
            'data-into': into,
            'aria-current': current === link.key ? 'page' : undefined,
            'aria-keyshortcuts': [closes && 'Delete', drag['aria-keyshortcuts']].filter(Boolean).join(' ') || undefined,
            onClick: onOpen ? (e: MouseEvent) => onOpen(link, e) : undefined,
            onContextMenu: onMenu && ((e: MouseEvent) => onMenu(link.key, e)),
            onKeyDown: (e: KeyboardEvent) => {
              (drag.onKeyDown as ((e: KeyboardEvent) => void) | undefined)?.(e);
              onMenu?.(link.key, e);
              if (e.defaultPrevented || !closes || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
              e.preventDefault();
              onClose(link.key);
            },
          };
          const close = closes && (
            <Tip content={() => labels.close(name)}>
              <span class="uk-tab-close" aria-hidden="true" onClick={tool(() => onClose(link.key))}>
                <Icon name="x" />
              </span>
            </Tip>
          );
          if (render) return render(link, { attrs, close });
          return (
            <a {...attrs} class="uk-tab">
              {orientation === 'vertical' && <TabMark icon={link.icon} name={typeof link.label === 'string' ? link.label : (link.title ?? '')} />}
              <span class="uk-tab-label">{link.label}</span>
              {close}
            </a>
          );
        }}
      />
      {end}
    </nav>
  );
}
