import { NavView } from '@overkube/sdk';
import { usePage, useSay } from '@overkube/sdk/preact';
import {
  Catalog,
  type CatalogGroup,
  closeTab,
  Icon,
  moveTab,
  NavList,
  type NavListGroup,
  nextTab,
  openTab,
  Popover,
  pinTab,
  type TabLink,
  TabLinks,
  type TabLists,
  usePresence,
} from '@overkube/uikit';
import { useDefinition } from '@overweave/ui/preact';
import type { Signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type Nav, type NavEntry, useNav } from './nav.ts';
import { T } from './texts.ts';

/*
 * The navigation, drawn: as tabs across the top (those pinned, those open —
 * as a browser's: the page goes to one, it is open till closed; dragged
 * into the pinned, pinned; "+" for the rest: the kinds' picker) or as a menu
 * down the side (every group) — as the NavView says (its mode: the user's
 * to switch, as a table's widths). Links all: opened in a new tab too.
 */

/** The navigation's mode, as the NavView says (tabs, unless it says otherwise). */
function useMode(): 'tabs' | 'side' {
  return useDefinition(NavView, 'default')?.spec.mode ?? 'tabs';
}

/**
 * The tabs the user made: the pinned in their order (none yet: as the
 * KindViews say), those open. Kept while the page runs; the user's layer's
 * (KindView pinned, order), once there is one.
 */
export interface TabsKept {
  pinned?: string[];
  open: string[];
}

/** Tabs: the pinned, those open (the one the page is at among them); "+" at their end opens the rest. */
export function NavTabs({ tabs }: { tabs: Signal<TabsKept> }) {
  const nav = useNav();
  const page = usePage();
  const say = useSay();
  const add = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  const presence = usePresence(picking);
  const shown = useMode() === 'tabs';
  const kept = tabs.value;
  const made: TabLists = { pinned: kept.pinned ?? nav.pinned.map((e) => e.key), open: kept.open };
  // The one the page is at: a tab (open, last, if it is none yet) — kept so once drawn (not while the menu is shown instead).
  const lists = nav.current && shown ? openTab(made, nav.current.key) : made;
  useEffect(() => {
    if (lists !== made) tabs.value = { ...tabs.peek(), open: lists.open };
  }, [lists.open.join('\n')]);
  if (!shown) return null;
  // Drawn: those the navigation knows now (one it knows not yet, or no longer — a kind not served — kept, not drawn).
  const entries = new Map(nav.groups.flatMap((g) => g.entries.map((e) => [e.key, e] as const)));
  const known = (keys: readonly string[]) => keys.filter((k) => entries.has(k));
  const keep = (next: TabLists) => {
    tabs.value = { pinned: next.pinned, open: next.open };
  };
  const link =
    (pinned: boolean) =>
    (key: string): TabLink => {
      const e = entries.get(key) as NavEntry;
      return { key, label: e.title, href: page.href(e.path), title: e.kind?.id ?? e.path, pinned, closable: !pinned, transient: !pinned };
    };
  const closeOne = (key: string) => {
    if (key === nav.current?.key) {
      const next = nextTab({ pinned: known(lists.pinned), open: known(lists.open) }, key);
      page.navigate(next ? (entries.get(next) as NavEntry).path : '/');
    }
    keep(closeTab(lists, key));
  };
  const close = () => {
    setPicking(false);
    add.current?.focus();
  };
  return (
    <>
      <TabLinks
        label={say(T.nav.kinds)}
        sections={[
          { id: 'pinned', tabs: known(lists.pinned).map(link(true)), draggable: true },
          { id: 'open', tabs: known(lists.open).map(link(false)), draggable: true },
        ]}
        current={nav.current?.key}
        labels={{ close: (title) => say(T.nav.close, { title }), unpin: (title) => say(T.nav.unpin, { title }) }}
        onClose={closeOne}
        onPin={(key, pin) => keep(pinTab(lists, key, pin, nav.current?.key))}
        onMove={(key, section, index) => {
          // Its place among those drawn, as a place among those kept (some not drawn): before the one drawn there.
          const kept = (section === 'pinned' ? lists.pinned : lists.open).filter((k) => k !== key);
          const before = known(kept)[index];
          keep(moveTab(lists, key, section, before ? kept.indexOf(before) : kept.length));
        }}
        end={
          <button
            type="button"
            ref={add}
            class="uk-tab"
            aria-label={say(T.nav.all)}
            aria-haspopup="dialog"
            aria-expanded={picking}
            onClick={() => (picking ? close() : setPicking(true))}
          >
            <Icon name="plus" />
          </button>
        }
      />
      {presence.mounted && <KindPicker nav={nav} anchor={add} state={presence.state} onClose={close} />}
    </>
  );
}

/** Everything there is to go to, in groups, filtered as typed: a popover by what opened it. */
export function KindPicker({ nav, anchor, state, onClose }: { nav: Nav; anchor: { current: HTMLElement | null }; state?: 'open' | 'closing'; onClose: () => void }) {
  const page = usePage();
  const say = useSay();
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase(say.locale);
  const groups: CatalogGroup[] = nav.groups
    .map((g) => ({
      key: g.key,
      title: g.title,
      items: g.entries
        .filter((e) => !q || e.title.toLocaleLowerCase(say.locale).includes(q) || e.kind?.id.toLowerCase().includes(q))
        .map((e) => ({ key: e.key, label: e.title, title: e.kind?.id, href: page.href(e.path) })),
    }))
    .filter((g) => g.items.length);
  return (
    <Popover onClose={onClose} anchor={anchor} state={state} label={say(T.nav.all)} class="uk-picker">
      <Catalog groups={groups} query={query} onQuery={setQuery} placeholder={say(T.nav.find)} empty={say(T.nav.nothingLike, { query })} onOpen={onClose} />
    </Popover>
  );
}

/** A menu down the side: every group, its entries as links (the kit's NavList). */
export function NavSide() {
  const nav = useNav();
  const page = usePage();
  const say = useSay();
  if (useMode() !== 'side') return null;
  const groups: NavListGroup[] = nav.groups.map((g) => ({
    key: g.key,
    title: g.title,
    items: g.entries.map((e) => ({ key: e.key, label: e.title, href: page.href(e.path), title: e.kind?.id, icon: e.icon })),
  }));
  return <NavList label={say(T.nav.kinds)} groups={groups} current={nav.current?.key} />;
}
