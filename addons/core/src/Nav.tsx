import { NavView } from '@overkube/sdk';
import { usePage, useSay } from '@overkube/sdk/preact';
import { Catalog, type CatalogGroup, Icon, NavList, type NavListGroup, Popover, type TabLink, TabLinks, usePresence } from '@overkube/uikit';
import { useDefinition } from '@overweave/ui/preact';
import { useRef, useState } from 'preact/hooks';
import { type Nav, type NavEntry, useNav } from './nav.ts';
import { T } from './texts.ts';

/*
 * The navigation, drawn: as tabs across the top (those pinned, the one the
 * page is at beside them, "+" for the rest: the kinds' picker) or as a menu
 * down the side (every group) — as the NavView says (its mode: the user's
 * to switch, as a table's widths). Links all: opened in a new tab too.
 */

/** The navigation's mode, as the NavView says (tabs, unless it says otherwise). */
function useMode(): 'tabs' | 'side' {
  return useDefinition(NavView, 'default')?.spec.mode ?? 'tabs';
}

/** Tabs: the pinned, and the one the page is at if it is not one of them; "+" at their end opens the rest. */
export function NavTabs() {
  const nav = useNav();
  const page = usePage();
  const say = useSay();
  const add = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  const presence = usePresence(picking);
  if (useMode() !== 'tabs') return null;
  const open = nav.current && !nav.current.pinned ? [nav.current] : [];
  const link = (e: NavEntry, transient = false): TabLink => ({
    key: e.key,
    label: e.title,
    href: page.href(e.path),
    title: e.kind?.id ?? e.path,
    ...(transient ? { transient } : {}),
  });
  const close = () => {
    setPicking(false);
    add.current?.focus();
  };
  return (
    <>
      <TabLinks
        label={say(T.nav.kinds)}
        sections={[
          { id: 'pinned', links: nav.pinned.map((e) => link(e)) },
          { id: 'open', links: open.map((e) => link(e, true)) },
        ]}
        current={nav.current?.key}
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
