import type { KindInfo } from '@overkube/kube-types';
import { Category, type CategorySpec, KindView, type KindViewSpec, kindPath, kindRef, kindRefIn, type Label, Page, type PageSpec } from '@overkube/sdk';
import { usePage, useSay, useServedKinds } from '@overkube/sdk/preact';
import type { Definition } from '@overweave/core';
import { inOrder } from '@overweave/ui';
import { useDefinitions } from '@overweave/ui/preact';
import { useMemo } from 'preact/hooks';
import { titleOf } from './kinds.ts';
import { T } from './texts.ts';

/*
 * The navigation, as data: what can be gone to — every kind the cluster
 * serves (as its KindView says: its title, icon, category, order, whether
 * it is hidden or pinned) and every page with a title (a Page: hidden or
 * pinned as a kind is) —
 * in groups (a Category, else the kind's API group); and where the page is
 * now. navOf is the model, pure; useNav follows what it is made of (made
 * again only when that changes, not at each path). Drawn as tabs or as a
 * menu (the core's), or as another addon draws it.
 */

export interface NavEntry {
  key: string;
  title: string;
  path: string;
  icon?: string;
  /** A kind's (none: an addon's page). */
  kind?: KindInfo;
  pinned: boolean;
  order: number;
  group: string;
}

export interface NavGroup {
  key: string;
  title: string;
  /** Its category's (none: a kind's API group, the pages). */
  icon?: string;
  entries: NavEntry[];
}

export interface Nav {
  groups: NavGroup[];
  /** Those kept at hand (tabs), in order. */
  pinned: NavEntry[];
  /** The one the page is at, if any is. */
  current?: NavEntry;
}

const PAGES = 'pages';

/** The navigation of these kinds, views, categories and pages: its groups and pinned (where the page is: currentOf). */
export function navOf(
  kinds: Iterable<KindInfo>,
  views: readonly Definition<KindViewSpec>[],
  categories: readonly Definition<CategorySpec>[],
  pages: readonly Definition<PageSpec>[],
  /** How a label is said (the page's language). */
  said: (label: Label) => string,
  /** The language, as titles are ordered in it. */
  locale = 'en',
): Omit<Nav, 'current'> & { entries: NavEntry[] } {
  const collator = new Intl.Collator(locale);
  const byOrder = (a: NavEntry, b: NavEntry) => a.order - b.order || collator.compare(a.title, b.title);
  const byName = new Map(views.map((d) => [d.name, d.spec]));
  const entries: NavEntry[] = [];
  for (const kind of kinds) {
    const view = byName.get(kind.id);
    if (view?.hidden) continue;
    entries.push({
      key: kind.id,
      title: view?.title ? said(view.title) : titleOf(kind),
      path: kindPath(kind),
      icon: view?.icon,
      kind,
      pinned: view?.pinned === true,
      order: view?.order ?? 500,
      group: view?.category ?? `group:${kind.group}`,
    });
  }
  // The pages: those with a title, at a path of their own (no parameters), not hidden — as a kind is, pinned or not.
  for (const p of pages) {
    if (!p.spec.title || p.spec.hidden || p.spec.path.includes(':')) continue;
    entries.push({
      key: `page:${p.name}`,
      title: said(p.spec.title),
      path: p.spec.path.replace(/\/\*$/, '') || '/',
      icon: p.spec.icon,
      pinned: p.spec.pinned === true,
      order: p.spec.order ?? 500,
      group: PAGES,
    });
  }
  const ordered = inOrder(categories);
  const titles = new Map<string, string>([[PAGES, said(T.nav.pages)], ...ordered.map((c) => [c.name, said(c.spec.title)] as [string, string])]);
  const order = [PAGES, ...ordered.map((c) => c.name)];
  const keys = [...new Set(entries.map((e) => e.group))].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
    return collator.compare(a, b);
  });
  const icons = new Map(ordered.map((c) => [c.name, c.spec.icon]));
  const groups = keys.map((key) => ({
    key,
    icon: icons.get(key),
    // A kind's API group (core: the core group's), as Kubernetes names it: a term, not words to translate.
    title: titles.get(key) ?? (key === 'group:' ? 'Core' : key.replace(/^group:/, '')),
    entries: entries.filter((e) => e.group === key).sort(byOrder),
  }));
  return { groups, pinned: entries.filter((e) => e.pinned).sort(byOrder), entries };
}

/** Where a path is, of these entries: a kind's page (/k/<ref>), or another page under its path (what is opened over it aside). */
export function currentOf(entries: readonly NavEntry[], at: string): NavEntry | undefined {
  const ref = kindRefIn(at);
  const path = at.split('?')[0];
  if (ref) return entries.find((e) => e.kind && kindRef(e.kind) === ref);
  return entries.filter((e) => !e.kind && (path === e.path || path.startsWith(`${e.path}/`))).sort((a, b) => b.path.length - a.path.length)[0];
}

export function useNav(): Nav {
  const { kinds } = useServedKinds();
  const views = useDefinitions(KindView);
  const categories = useDefinitions(Category);
  const pages = useDefinitions(Page);
  const path = usePage().path.value;
  const say = useSay();
  const model = useMemo(() => navOf(kinds.values(), views, categories, pages, say, say.locale), [kinds, views, categories, pages, say]);
  return { groups: model.groups, pinned: model.pinned, current: currentOf(model.entries, path) };
}
