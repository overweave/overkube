import type { NavPickerEntry, NavPickerItemProps, NavPickerPartProps, NavPickerProps, NavPickerSection, NavPickerSectionProps } from '@overkube/sdk';
import { slots } from '@overkube/sdk';
import { usePage, useSay } from '@overkube/sdk/preact';
import { CatalogBody, CatalogBox, CatalogHeading, CatalogPane, CatalogRow, CatalogSearch, CatalogSection, CatalogTop, EmptyState, Highlight, pinTab } from '@overkube/uikit';
import { slotElement } from '@overweave/ui/preact';
import { Fragment } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { builtIn } from './kinds.ts';
import { type TabsState, useTabs } from './Nav.tsx';
import { type NavEntry, type NavGroup, useNav } from './nav.ts';
import { T } from './texts.ts';

/*
 * The kinds' picker (nav.picker's last), in two panes: a search on top;
 * down the side the sections — pinned, the pages, each category, the
 * cluster's custom resources, the API's own kinds (these two under their
 * API groups); beside them the chosen one's. Typed: every section searched
 * — all the matches by section, each section's count of them (one chosen
 * then: its alone). An entry pinned or unpinned in place (a tab kept at
 * hand). Each part a slot (the core's the last where one is drawn).
 */

const PINNED = 'pinned';
const CUSTOM = 'custom';
const APIS = 'apis';
const ICONS: Record<string, string> = { [PINNED]: 'pin', [CUSTOM]: 'puzzle', [APIS]: 'layers', pages: 'home' };

/** An entry of the navigation, in the picker: its icon (none: its section's), the heading it is under (an API group's). */
const entryOf = (e: NavEntry, icon: string | undefined, heading?: string): NavPickerEntry => ({
  key: e.key,
  title: e.title,
  path: e.path,
  icon: e.icon ?? icon,
  kind: e.kind,
  ...(heading ? { heading } : {}),
});

/** How well an entry matches what is typed (none: not at all): its name from its start, within it, then its kind's API group. */
function scoreOf(e: NavPickerEntry, q: string, locale: string): number | undefined {
  const title = e.title.toLocaleLowerCase(locale);
  if (title.startsWith(q)) return 0;
  if (title.includes(q)) return 1;
  if (e.kind?.group.includes(q)) return 2;
  return undefined;
}

/** The picker's sections, as typed (each its entries that match, best first): pinned, the navigation's groups — those of no category gathered as custom resources or the API's own. */
function sectionsOf(groups: readonly NavGroup[], pinned: readonly string[], query: string, locale: string, say: ReturnType<typeof useSay>): NavPickerSection[] {
  const all = new Map<string, NavPickerSection & { entries: NavPickerEntry[] }>();
  const section = (key: string, title: string, icon?: string) => {
    if (!all.has(key)) all.set(key, { key, title, icon, entries: [] });
    return all.get(key) as NavPickerSection & { entries: NavPickerEntry[] };
  };
  const pins = section(PINNED, say(T.nav.picker.pinned), ICONS[PINNED]);
  const byKey = new Map<string, NavPickerEntry>();
  for (const g of groups) {
    const apiGroup = g.key.startsWith('group:') ? g.key.slice('group:'.length) : undefined;
    const into =
      apiGroup === undefined
        ? section(g.key, g.title, g.icon ?? ICONS[g.key])
        : builtIn(apiGroup)
          ? section(APIS, say(T.nav.picker.apis), ICONS[APIS])
          : section(CUSTOM, say(T.nav.picker.custom), ICONS[CUSTOM]);
    for (const e of g.entries) {
      const entry = entryOf(e, into.icon, apiGroup === undefined ? undefined : g.title);
      into.entries.push(entry);
      byKey.set(e.key, entry);
    }
  }
  pins.entries.push(...pinned.flatMap((k) => byKey.get(k) ?? []).map(({ heading, ...e }) => e));
  // The custom resources always there (none: said so); the API's own after them.
  section(CUSTOM, say(T.nav.picker.custom), ICONS[CUSTOM]);
  const order = [...all.values()].sort((a, b) => rank(a.key) - rank(b.key));
  const q = query.trim().toLocaleLowerCase(locale);
  if (!q) return order;
  return order.map((s) => {
    const scored = s.entries.flatMap((e) => {
      const score = scoreOf(e, q, locale);
      return score === undefined ? [] : [{ e, score }];
    });
    return { ...s, entries: scored.sort((a, b) => a.score - b.score).map(({ e }) => e) };
  });
}
const rank = (key: string) => (key === PINNED ? 0 : key === CUSTOM ? 2 : key === APIS ? 3 : 1);

/** The core's picker (nav.picker's last): what is typed, the section chosen, the tabs pinned — given to its parts' slots. */
export function Picker({ close, tabs }: NavPickerProps & { tabs: TabsState }) {
  const nav = useNav();
  const say = useSay();
  const [query, setQuery] = useState('');
  const [section, setSection] = useState(PINNED);
  // Typed: every section's matches, unless one is chosen among them (typed again: every section's).
  const [narrow, setNarrow] = useState<string | null>(null);
  const { lists, keep } = useTabs(tabs);
  const typed = query.trim() !== '';
  const sections = useMemo(() => sectionsOf(nav.groups, lists.pinned, query, say.locale, say), [nav.groups, lists.pinned.join('\n'), query, say]);
  const props: NavPickerPartProps = {
    close,
    query,
    onQuery: (next) => {
      setQuery(next);
      setNarrow(null);
    },
    sections,
    chosen: typed ? narrow : section,
    choose: (key) => (typed ? setNarrow(key) : key !== null && setSection(key)),
    pinned: (key) => lists.pinned.includes(key),
    pin: (key, on) => {
      keep(pinTab(lists, key, on, nav.current?.key));
    },
  };
  return (
    <CatalogBox>
      <CatalogTop>{slotElement(slots.nav.picker.header, props)}</CatalogTop>
      <CatalogBody label={say(T.nav.picker.sections)} side={slotElement(slots.nav.picker.side, props)}>
        <CatalogPane key={`${typed}/${props.chosen}`}>{slotElement(slots.nav.picker.content, props)}</CatalogPane>
      </CatalogBody>
    </CatalogBox>
  );
}

/** The core's search, in the picker's header. */
export function PickerSearch({ query, onQuery }: NavPickerPartProps) {
  const say = useSay();
  return <CatalogSearch query={query} onQuery={onQuery} placeholder={say(T.nav.picker.search)} />;
}

/** Down its side (the core's): typed, all the matches first; every section, each the nav.picker.section slot's. */
export function PickerSide(props: NavPickerPartProps) {
  const say = useSay();
  const all = props.sections.reduce((n, s) => n + (s.key === PINNED ? 0 : s.entries.length), 0);
  return (
    <>
      {props.query.trim() && (
        <CatalogSection icon="search" count={all} chosen={props.chosen === null} onClick={() => props.choose(null)}>
          {say(T.nav.picker.allMatches)}
        </CatalogSection>
      )}
      {props.sections.map((section) => (
        <Fragment key={section.key}>{slotElement(slots.nav.picker.section, { ...props, section }, { limit: 1 })}</Fragment>
      ))}
    </>
  );
}

/** A section down the side (nav.picker.section's last): its icon, what is in it the content slot's (the core's title), how many. */
export function PickerSection(props: NavPickerSectionProps) {
  const { section, chosen, choose } = props;
  return (
    <CatalogSection icon={section.icon} count={section.entries.length} chosen={chosen === section.key} onClick={() => choose(section.key)}>
      {slotElement(slots.nav.picker.section.content, props)}
    </CatalogSection>
  );
}

/**
 * What the chosen section shows (the core's, beside the side): its entries
 * under their headings (an API group's) — typed and none chosen, every
 * section's matches by section; each the nav.picker.item slot's. Nothing
 * to show: the nav.picker.empty slot's.
 */
export function PickerContent(props: NavPickerPartProps) {
  const { sections, chosen, query, close } = props;
  const shown: { heading?: string; entries: readonly NavPickerEntry[] }[] =
    chosen === null
      ? sections.filter((s) => s.key !== PINNED && s.entries.length).map((s) => ({ heading: s.title, entries: s.entries }))
      : byHeading(sections.find((s) => s.key === chosen)?.entries ?? []);
  if (!shown.some((g) => g.entries.length)) return slotElement(slots.nav.picker.empty, props, { limit: 1 });
  let place = 0;
  return (
    <>
      {shown.map((g) => (
        <div key={g.heading ?? ''}>
          {g.heading && <CatalogHeading>{g.heading}</CatalogHeading>}
          {g.entries.map((entry) => {
            const item: NavPickerItemProps = { entry, kind: entry.kind, query, pinned: props.pinned(entry.key), pin: (on) => props.pin(entry.key, on), close, place: place++ };
            return <Fragment key={entry.key}>{slotElement(slots.nav.picker.item, item, { limit: 1 })}</Fragment>;
          })}
        </div>
      ))}
    </>
  );
}

/** Entries under their headings, in the order they come (none: one group, no heading). */
function byHeading(entries: readonly NavPickerEntry[]): { heading?: string; entries: NavPickerEntry[] }[] {
  const groups = new Map<string | undefined, NavPickerEntry[]>();
  for (const e of entries) groups.set(e.heading, [...(groups.get(e.heading) ?? []), e]);
  return [...groups].map(([heading, list]) => ({ heading, entries: list }));
}

/** An entry as the core draws it (nav.picker.item's last): a link to it (gone to: the picker closed), its icon, what is in it the content slot's, its pin. */
export function PickerItem(item: NavPickerItemProps) {
  const page = usePage();
  const say = useSay();
  const { entry, pinned, pin, close, place } = item;
  return (
    <CatalogRow
      link={{
        href: page.href(entry.path),
        title: entry.kind?.id,
        onClick: (e: MouseEvent) => {
          // A new tab, a new window: the browser's.
          if (!(e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) close();
        },
      }}
      icon={entry.icon}
      place={place}
      pin={{ on: pinned, label: say(pinned ? T.nav.picker.unpin : T.nav.picker.pin, { title: entry.title }), onToggle: pin }}
    >
      {slotElement(slots.nav.picker.item.content, item)}
    </CatalogRow>
  );
}

/** What is in a section down the side (the core's): its title. */
export function PickerSectionTitle({ section }: NavPickerSectionProps) {
  return <>{section.title}</>;
}

/** What is in an entry (the core's): its title, what is typed marked. */
export function PickerItemTitle({ entry, query }: NavPickerItemProps) {
  return <Highlight text={entry.title} query={query} />;
}

/** Nothing to show (nav.picker.empty's last): nothing matches (clear it); nothing in the section chosen among the matches (search everywhere); a section with nothing in it, what it is for. */
export function PickerEmpty({ query, sections, chosen, onQuery, choose }: NavPickerPartProps) {
  const say = useSay();
  const typed = query.trim();
  const section = sections.find((s) => s.key === chosen);
  const icon = section?.icon ?? 'search';
  if (typed && !section)
    return (
      <EmptyState icon="search" title={say(T.nav.picker.nothingLike, { query: typed })} action={{ label: say(T.nav.picker.clear), run: () => onQuery('') }}>
        {say(T.nav.picker.tryElse)}
      </EmptyState>
    );
  if (typed && section) {
    const elsewhere = sections.reduce((n, s) => n + (s.key === PINNED ? 0 : s.entries.length), 0);
    return (
      <EmptyState
        icon={icon}
        title={say(T.nav.picker.nothingIn, { query: typed, section: section.title })}
        action={elsewhere ? { label: say(T.nav.picker.everywhere), run: () => choose(null) } : undefined}
      >
        {elsewhere ? say(T.nav.picker.elsewhere, { count: elsewhere }) : undefined}
      </EmptyState>
    );
  }
  const [title, line] =
    chosen === PINNED
      ? [T.nav.picker.empty.pinned, T.nav.picker.empty.pinnedLine]
      : chosen === CUSTOM
        ? [T.nav.picker.empty.custom, T.nav.picker.empty.customLine]
        : [T.nav.picker.empty.section, T.nav.picker.empty.sectionLine];
  return (
    <EmptyState icon={icon} title={say(title)}>
      {say(line)}
    </EmptyState>
  );
}
