import { type NavPickerItemProps, type NavPickerPartProps, type NavPickerProps, type NavTabContext, type NavTabProps, type NavTabsProps, NavView, slots } from '@overkube/sdk';
import { useMenu, usePage, useSay } from '@overkube/sdk/preact';
import {
  CatalogBox,
  type CatalogGroup,
  CatalogGroups,
  type CatalogItemParts,
  CatalogSearch,
  CatalogTop,
  closeFocused,
  closeTab,
  keepFocused,
  moveTab,
  nextTab,
  openTab,
  Popover,
  pinTab,
  SideRail,
  TabButton,
  type TabLink,
  TabLinks,
  type TabLists,
  TabMark,
  type TabParts,
  usePresence,
} from '@overkube/uikit';
import { slotElement, useDefinition } from '@overweave/ui/preact';
import { type Signal, useComputed } from '@preact/signals';
import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type NavEntry, useNav } from './nav.ts';
import { T } from './texts.ts';

/*
 * The navigation, drawn: as tabs (those pinned, those open — as a
 * browser's: the page goes to one, it is open till closed; dragged into the
 * pinned, pinned; "+" for the rest: the kinds' picker) across the top, or
 * the same tabs down the side, in a rail (collapsed: their marks; peeking
 * over the page; pinned beside it) — as the NavView says (its mode, and the
 * rail at first: the user's to switch). Links all: opened in a new tab too.
 */

/** How the navigation is drawn, as the NavView says: tabs across the top unless it says side; down the side collapsed unless it says pinned. */
function useView(): { mode: 'tabs' | 'side'; side: 'collapsed' | 'pinned' } {
  const spec = useDefinition(NavView, 'default')?.spec;
  return { mode: spec?.mode ?? 'tabs', side: spec?.side ?? 'collapsed' };
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

/** The tabs while the page runs: as the user made them; the side rail pinned or collapsed (none yet: as the NavView says). */
export interface TabsState {
  kept: Signal<TabsKept>;
  side: Signal<'collapsed' | 'pinned' | undefined>;
}

/**
 * Tabs: the pinned, those open (the one the page is at among them), each its
 * context menu (nav.tabs.tab.context); after them, nav.tabs.actions (the
 * core's + there: PickerButton). Across the top, or down the side (collapsed
 * there: each tab told so) — drawn where the NavView's mode says.
 */
export function NavTabs({ tabs: state, placement = 'top', collapsed = false }: { tabs: TabsState; placement?: 'top' | 'side'; collapsed?: boolean }) {
  const tabs = state.kept;
  const menu = useMenu('nav.tabs.tab.context');
  const nav = useNav();
  const page = usePage();
  const say = useSay();
  const shown = useView().mode === (placement === 'side' ? 'side' : 'tabs');
  // Where they are: the same object while it is (the actions' slot not drawn again for nothing).
  const where = useMemo<NavTabsProps>(() => ({ placement, collapsed }), [placement, collapsed]);
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
      // Its tooltip: what it is in full — down the side (its mark alone seen), its name with it.
      const full = e.kind?.id ?? e.path;
      return { key, label: e.title, href: page.href(e.path), title: placement === 'side' ? `${e.title} · ${full}` : full, closable: !pinned, transient: !pinned };
    };
  const closeOne = (key: string) => {
    if (key === nav.current?.key) {
      const next = nextTab({ pinned: known(lists.pinned), open: known(lists.open) }, key);
      page.navigate(next ? (entries.get(next) as NavEntry).path : '/');
    }
    keep(closeTab(lists, key));
  };
  const pin = (key: string, on: boolean) => keep(pinTab(lists, key, on, nav.current?.key));
  const drawn = (key: string, e: NavEntry): NavTabProps => ({
    entry: { key, title: e.title, path: e.path, icon: e.icon },
    kind: e.kind,
    pinned: lists.pinned.includes(key),
    current: key === nav.current?.key,
    placement,
    collapsed,
  });
  return (
    <TabLinks
      label={say(T.nav.kinds)}
      orientation={placement === 'side' ? 'vertical' : 'horizontal'}
      sections={[
        { id: 'pinned', tabs: known(lists.pinned).map(link(true)), draggable: true },
        { id: 'open', tabs: known(lists.open).map(link(false)), draggable: true },
      ]}
      render={(t, parts) => {
        // As it is drawn now (dragged into another section: as it will be there).
        const tab = { ...drawn(t.key, entries.get(t.key) as NavEntry), pinned: !t.transient };
        return slotElement(slots.nav.tabs.tab, { ...tab, ...parts }, { limit: 1 });
      }}
      current={nav.current?.key}
      labels={{ close: (title) => say(T.nav.tabs.tab.closeTitle, { title }) }}
      onClose={closeOne}
      onMenu={(key, e) => {
        const entry = entries.get(key) as NavEntry;
        // What its items do (focus given back to the tab): kept on it where it moves, or to its neighbour as it closes (as the × does).
        const subject: NavTabContext = {
          ...drawn(key, entry),
          pin: (on) => keepFocused(key, () => pin(key, on)),
          close: () => closeFocused(null, key, closeOne),
        };
        menu(subject, e, entry.title);
      }}
      onMove={(key, section, index) => {
        // Its place among those drawn, as a place among those kept (some not drawn): before the one drawn there.
        const kept = (section === 'pinned' ? lists.pinned : lists.open).filter((k) => k !== key);
        const before = known(kept)[index];
        keep(moveTab(lists, key, section, before ? kept.indexOf(before) : kept.length));
      }}
      end={slotElement(slots.nav.tabs.actions, where)}
    />
  );
}

/** The picker opened from the side rail: beside it (its flyout), kept by it — what the + there opens. */
interface SidePicking {
  picking: boolean;
  toggle(): void;
  anchor: { current: HTMLButtonElement | null };
}
const SidePicker = createContext<SidePicking | null>(null);

/** The core's + after the tabs (nav.tabs.actions): everything there is to go to — in a popover under it; down the side, beside the rail. */
export function PickerButton({ placement }: NavTabsProps) {
  const say = useSay();
  const side = useContext(SidePicker);
  const add = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  const presence = usePresence(picking);
  const close = () => {
    setPicking(false);
    add.current?.focus();
  };
  if (placement === 'side' && side)
    return (
      <TabButton
        icon="plus"
        label={say(T.nav.picker.all)}
        buttonRef={(el) => {
          side.anchor.current = el;
        }}
        aria-haspopup="dialog"
        aria-expanded={side.picking}
        onClick={side.toggle}
      />
    );
  return (
    <>
      <TabButton icon="plus" label={say(T.nav.picker.all)} buttonRef={add} aria-haspopup="dialog" aria-expanded={picking} onClick={() => (picking ? close() : setPicking(true))} />
      {presence.mounted && <PickerPopover anchor={add} state={presence.state} onClose={close} />}
    </>
  );
}

/** A tab as the core draws it (the nav.tabs.tab slot's last): the kit's link — down the side its mark first (nav.tabs.tab.mark's) — what is in it the content slot's (the core's title there), its ×. */
export function NavTab({ attrs, close, ...tab }: NavTabProps & TabParts) {
  return (
    <a {...attrs} class="uk-tab">
      {tab.placement === 'side' && slotElement(slots.nav.tabs.tab.mark, tab, { limit: 1 })}
      <span class="uk-tab-label">{slotElement(slots.nav.tabs.tab.content, tab)}</span>
      {close}
    </a>
  );
}

/** A tab's mark down the side (the core's, nav.tabs.tab.mark's last): its icon, or its name's first letter. */
export function NavTabMark({ entry }: NavTabProps) {
  return <TabMark icon={entry.icon} name={entry.title} />;
}

/** Everything there is to go to (the nav.picker slot: the core's catalog, or another's), in a popover by what opened it. */
export function PickerPopover({
  anchor,
  flyout = false,
  state,
  onClose,
}: {
  anchor: { current: HTMLElement | null };
  /** Beside the side rail, its whole height (its flyout), not under the anchor. */
  flyout?: boolean;
  state?: 'open' | 'closing';
  onClose: () => void;
}) {
  const say = useSay();
  return (
    <Popover onClose={onClose} anchor={anchor} placed={!flyout} state={state} label={say(T.nav.picker.all)} class={flyout ? 'uk-picker uk-rail-flyout' : 'uk-picker'}>
      {slotElement(slots.nav.picker, { close: onClose }, { limit: 1 })}
    </Popover>
  );
}

/** The core's picker (nav.picker's last): what is typed kept here, given to its header (the core's search) and its content (the core's groups). */
export function Picker({ close }: NavPickerProps) {
  const [query, setQuery] = useState('');
  const props: NavPickerPartProps = { query, onQuery: setQuery, close };
  return (
    <CatalogBox>
      <CatalogTop>{slotElement(slots.nav.picker.header, props)}</CatalogTop>
      {slotElement(slots.nav.picker.content, props)}
    </CatalogBox>
  );
}

/** The core's search, in the picker's header. */
export function PickerSearch({ query, onQuery }: NavPickerPartProps) {
  const say = useSay();
  return <CatalogSearch query={query} onQuery={onQuery} placeholder={say(T.nav.picker.search)} />;
}

/** The core's groups, in the picker's content: filtered as typed; each item the nav.picker.item slot's. */
export function PickerGroups({ query, close }: NavPickerPartProps) {
  const nav = useNav();
  const page = usePage();
  const say = useSay();
  const q = query.trim().toLocaleLowerCase(say.locale);
  const entries = new Map(nav.groups.flatMap((g) => g.entries.map((e) => [e.key, e] as const)));
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
    <CatalogGroups
      groups={groups}
      query={query}
      empty={say(T.nav.picker.nothingLike, { query })}
      onOpen={close}
      renderItem={(item, parts) => {
        const e = entries.get(item.key) as NavEntry;
        return slotElement(slots.nav.picker.item, { entry: { key: e.key, title: e.title, path: e.path }, kind: e.kind, query, ...parts }, { limit: 1 });
      }}
    />
  );
}

/** An item as the core draws it (nav.picker.item's last): the kit's link, what is in it the content slot's (the core's title there). */
export function PickerItem({ attrs, ...item }: NavPickerItemProps & CatalogItemParts) {
  return (
    <a {...attrs} class="uk-catalog-name">
      {slotElement(slots.nav.picker.item.content, item)}
    </a>
  );
}

/**
 * The tabs down the side (nav.side's, when the NavView says side): in a rail —
 * collapsed (their marks), peeking over the page (kept so while a tab's menu
 * is open), or pinned beside it, as the user toggles it (as the NavView says
 * at first).
 */
export function NavSide({ tabs }: { tabs: TabsState }) {
  const say = useSay();
  const page = usePage();
  const view = useView();
  // Followed as a yes or no: another menu (a table's row) opening draws nothing here.
  const held = useComputed(() => page.menu.value?.on === 'nav.tabs.tab.context').value;
  // The picker its + opens: beside it (its flyout), focus back on the + as it closes.
  const anchor = useRef<HTMLButtonElement | null>(null);
  const [picking, setPicking] = useState(false);
  const presence = usePresence(picking);
  const close = () => {
    setPicking(false);
    anchor.current?.focus();
  };
  const sidePicking = useMemo<SidePicking>(() => ({ picking, toggle: () => (picking ? close() : setPicking(true)), anchor }), [picking]);
  if (view.mode !== 'side') return null;
  const pinned = (tabs.side.value ?? view.side) === 'pinned';
  return (
    <SidePicker.Provider value={sidePicking}>
      <SideRail
        label={say(T.nav.side.label)}
        pinned={pinned}
        onPin={(on) => {
          tabs.side.value = on ? 'pinned' : 'collapsed';
        }}
        labels={{ pin: say(T.nav.side.pin) }}
        hold={held}
        flyout={presence.mounted && <PickerPopover anchor={anchor} flyout state={presence.state} onClose={close} />}
      >
        {(expanded) => <NavTabs tabs={tabs} placement="side" collapsed={!expanded} />}
      </SideRail>
    </SidePicker.Provider>
  );
}
