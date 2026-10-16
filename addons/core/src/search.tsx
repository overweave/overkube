import { looseFilter } from '@overkube/cel';
import type { KindInfo } from '@overkube/kube-types';
import type { SearchResult } from '@overkube/query';
import { closeIn, filterIn, KindView, kindOfRef, kindPath, openIn } from '@overkube/sdk';
import { usePage, useSay, useSearch, useServedKinds } from '@overkube/sdk/preact';
import { Button, Highlight, Kbd, Spotlight, type SpotlightItem } from '@overkube/uikit';
import { useDefinitions } from '@overweave/ui/preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { titleOf } from './kinds.ts';
import type { Chosen } from './namespaces.tsx';
import { T } from './texts.ts';

/*
 * A search of every kind (core.header.search): opened by / (or ⌘K, Ctrl+K)
 * anywhere but where something is typed, or its button in the page's
 * header. What is typed, as loosely: words in a name, a label selector, a
 * kind's name first (po web). What is found by kind, the best first —
 * each one opened over the page; past the first few, all of them: its
 * kind's page filtered so. How far it is, under them: kinds looked
 * through, those that may not be listed, those cut short.
 */

/** Whether a key is pressed where something is typed (an input, a text area, an editable): its own, not the page's. */
function typing(e: KeyboardEvent): boolean {
  const at = e.composedPath()[0];
  return at instanceof HTMLElement && (at.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(at.tagName));
}

/** The search's button in the page's header (core.header.search), and the search itself while open. */
export function HeaderSearch({ chosen }: { chosen: Chosen }) {
  const say = useSay();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || open) return;
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e);
      const k = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
      if (!slash && !k) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);
  return (
    <>
      <Button icon="search" variant="field" title={say(T.search.open)} onClick={() => setOpen(true)}>
        {say(T.search.button)}
        <Kbd keys="/" />
      </Button>
      {open && <Search chosen={chosen} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The search, open: what is typed, what is found. */
function Search({ chosen, onClose }: { chosen: Chosen; onClose: () => void }) {
  const say = useSay();
  const page = usePage();
  const { kinds } = useServedKinds();
  const views = useDefinitions(KindView);
  const [query, setQuery] = useState('');
  // In the namespaces chosen in the header (none chosen: every one), as the kinds' pages show them.
  const namespaces = chosen.value;
  const found = useSearch({ text: query, ...(namespaces.length ? { scope: { namespaces } } : {}) });
  const iconOf = (kind: KindInfo) => views.find((v) => v.name === kind.id)?.spec.icon ?? 'cube';
  const items = useMemo(() => itemsOf(found, kinds, iconOf, say), [found, kinds, views]);
  const choose = (item: SpotlightItem) => {
    const [what, ref, namespace, name] = item.key.split('\u0000');
    // Of one kind only (its name typed first): everywhere instead, what was typed after it.
    if (what === 'everywhere') return setQuery(found.matched);
    const kind = kindOfRef(kinds, ref);
    if (!kind) return;
    onClose();
    if (what === 'all') page.navigate(filterIn(kindPath(kind), looseFilter(found.matched)));
    else page.navigate(openIn(closeIn(page.path.value), kind, { metadata: { name, ...(namespace ? { namespace } : {}) } }));
  };
  // On its way: what the cluster serves (a search not begun yet), or the kinds being looked through.
  const busy = (found.loading === true && query.trim() !== '') || (found.kinds > 0 && found.searched < found.kinds);
  // Nothing found: why — the search not to be done (signed out, what the cluster serves not known), a word too short, none there.
  const short = query.trim() !== '' && !found.error && !busy && found.searched === 0;
  const empty = found.error ? found.error.message : short ? say(T.search.short) : say(T.search.nothing);
  return (
    <Spotlight
      query={query}
      onQuery={setQuery}
      items={items}
      onChoose={choose}
      onClose={onClose}
      label={say(T.search.label)}
      placeholder={say(T.search.placeholder)}
      empty={empty}
      busy={busy}
      footer={<Progress found={found} />}
    />
  );
}

/** What is found, as rows: by kind (its name, how many), each one (its name, what is typed marked; its namespace), then all of them where there are more. */
function itemsOf(found: SearchResult, kinds: ReadonlyMap<string, KindInfo>, iconOf: (k: KindInfo) => string, say: ReturnType<typeof useSay>): SpotlightItem[] {
  const only = found.only && kindOfRef(kinds, found.only);
  // Of one kind only: said so, everywhere instead a choice away (last: Enter still opens the first found).
  const everywhere: SpotlightItem[] = only
    ? [{ key: ['everywhere', found.only ?? ''].join('\u0000'), title: say(T.search.everywhere, { kind: titleOf(only), text: found.matched }), icon: 'search' }]
    : [];
  // What is found by kind: those of the selector unmarked, those of words each word marked; all of them where there are more (as a filter of its kind's page).
  const filtered = looseFilter(found.matched) !== undefined;
  return [
    ...found.groups.flatMap((g) => {
      const kind = kindOfRef(kinds, g.kind);
      if (!kind) return [];
      const group = `${titleOf(kind)} · ${g.total}`;
      const icon = iconOf(kind);
      const one = g.items.map(
        (i): SpotlightItem => ({
          key: ['one', g.kind, i.namespace ?? '', i.name].join('\u0000'),
          title: <Highlight text={i.name} query={found.words} />,
          ...(i.namespace ? { subtitle: i.namespace } : {}),
          icon,
          group,
        }),
      );
      const all: SpotlightItem[] =
        filtered && g.total > g.items.length
          ? [{ key: ['all', g.kind].join('\u0000'), title: say(T.search.all, { count: g.total, kind: titleOf(kind) }), icon: 'search', group }]
          : [];
      return [...one, ...all];
    }),
    ...everywhere,
  ];
}

/** How far it is: kinds looked through of those there are; those that may not be listed, failed otherwise, read in part, cut short. */
function Progress({ found }: { found: SearchResult }) {
  const say = useSay();
  if (!found.kinds) return null;
  return (
    <span class="uk-quiet">
      {say(T.search.searched, { searched: found.searched, kinds: found.kinds })}
      {found.denied.length > 0 && ` · ${say(T.search.denied, { count: found.denied.length })}`}
      {found.failed.length > 0 && ` · ${say(T.search.failed, { count: found.failed.length })}`}
      {found.partial.length > 0 && ` · ${say(T.search.partial, { count: found.partial.length })}`}
      {found.truncated.length > 0 && ` · ${say(T.search.truncated, { count: found.truncated.length })}`}
    </span>
  );
}
