import type { KindInfo } from '@overkube/kube-types';
import { Category, type CategorySpec, KindView, type KindViewSpec, kindPath, kindRef, Route, type RouteSpec } from '@overkube/sdk';
import { usePage, useServedKinds } from '@overkube/sdk/preact';
import type { Definition } from '@overweave/core';
import { inOrder } from '@overweave/ui';
import { useDefinitions } from '@overweave/ui/preact';
import { useMemo } from 'preact/hooks';
import { titleOf } from './kinds.ts';

/*
 * The navigation, as data: what can be gone to — every kind the cluster
 * serves (as its KindView says: its title, icon, category, order, whether
 * it is hidden or pinned) and every addon's page with a title (a Route) —
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
const byOrder = (a: NavEntry, b: NavEntry) => a.order - b.order || a.title.localeCompare(b.title);

/** The navigation of these kinds, views, categories and routes: its groups and pinned (where the page is: currentOf). */
export function navOf(
  kinds: Iterable<KindInfo>,
  views: readonly Definition<KindViewSpec>[],
  categories: readonly Definition<CategorySpec>[],
  routes: readonly Definition<RouteSpec>[],
): Omit<Nav, 'current'> & { entries: NavEntry[] } {
  const byName = new Map(views.map((d) => [d.name, d.spec]));
  const entries: NavEntry[] = [];
  for (const kind of kinds) {
    const view = byName.get(kind.id);
    if (view?.hidden) continue;
    entries.push({
      key: kind.id,
      title: view?.title ?? titleOf(kind),
      path: kindPath(kind),
      icon: view?.icon,
      kind,
      pinned: view?.pinned === true,
      order: view?.order ?? 500,
      group: view?.category ?? `group:${kind.group}`,
    });
  }
  // An addon's pages: those with a title, at a path of their own (no parameters).
  for (const r of routes) {
    if (!r.spec.title || r.spec.path.includes(':')) continue;
    entries.push({
      key: `route:${r.name}`,
      title: r.spec.title,
      path: r.spec.path.replace(/\/\*$/, '') || '/',
      icon: r.spec.icon,
      pinned: false,
      order: r.spec.order ?? 500,
      group: PAGES,
    });
  }
  const ordered = inOrder(categories);
  const titles = new Map<string, string>([[PAGES, 'Pages'], ...ordered.map((c) => [c.name, c.spec.title] as [string, string])]);
  const order = [PAGES, ...ordered.map((c) => c.name)];
  const keys = [...new Set(entries.map((e) => e.group))].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
    return a.localeCompare(b);
  });
  const groups = keys.map((key) => ({
    key,
    title: titles.get(key) ?? (key === 'group:' ? 'Core' : key.replace(/^group:/, '')),
    entries: entries.filter((e) => e.group === key).sort(byOrder),
  }));
  return { groups, pinned: entries.filter((e) => e.pinned).sort(byOrder), entries };
}

/** Where a path is, of these entries: a kind's table or one of its objects (/k/<ref>…), or an addon's page under its path. */
export function currentOf(entries: readonly NavEntry[], path: string): NavEntry | undefined {
  const ref = path.match(/^\/k\/([^/]+)/)?.[1];
  if (ref) return entries.find((e) => e.kind && kindRef(e.kind) === ref);
  return entries.filter((e) => !e.kind && (path === e.path || path.startsWith(`${e.path}/`))).sort((a, b) => b.path.length - a.path.length)[0];
}

export function useNav(): Nav {
  const { kinds } = useServedKinds();
  const views = useDefinitions(KindView);
  const categories = useDefinitions(Category);
  const routes = useDefinitions(Route);
  const path = usePage().path.value;
  const model = useMemo(() => navOf(kinds.values(), views, categories, routes), [kinds, views, categories, routes]);
  return { groups: model.groups, pinned: model.pinned, current: currentOf(model.entries, path) };
}
