import type { KubeObject } from '@overkube/kube-types';
import { type AccessAsk, type AccessResult, allowed, type Live } from '@overkube/query';
import {
  type Access,
  type AccessSubject,
  Action,
  type Cluster,
  KindView,
  knownNamespaces,
  MenuItem,
  type NamespacesSpec,
  type Need,
  Page,
  ResourceTab,
  slots,
  standingOf,
} from '@overkube/sdk';
import { Icon } from '@overkube/uikit';
import type { Registry } from '@overweave/core';
import { definitionSignal, fill, listSignal } from '@overweave/ui/preact';
import { effect } from '@preact/signals';

/*
 * The access layer: what the one signed in may not have, taken out of the
 * page — a contributor over everyone (its priority above the user's), so
 * no addon, plugin or user shows it again, and who hid it is its
 * provenance. What it reads is the cluster's word (its rules, Source's
 * access); what it hides:
 *
 * - a kind listed nowhere (not in the cluster, nor in any namespace there
 *   is): its KindView hidden; a Page whose needs are had nowhere, too;
 * - whatever says what it needs (needs: a resource's tab, an action, a
 *   menu's item, a page): its access, said for what it is drawn for (an
 *   object: its namespace's rules) — those who draw them leave out what is
 *   denied; a page denied says so in its place.
 *
 * Marked (debugging): nothing hidden — what would be is shown marked
 * (its icon: denied; a tab across the top, where no icon is drawn, its
 * mark before its title: a fill of its own). Not known (on its way, failed, rules incomplete):
 * allowed — the API server decides then.
 */

/**
 * So many namespaces at most asked about one by one (what may be had
 * anywhere: a review each) — fewer than the source watches one by one (a
 * list each, 150): more, and what the cluster refuses is not known.
 */
const MAX_NAMESPACES = 50;

/** The definitions it says something of: what they need, and whether they are drawn per object (access) or listed (hidden). */
const NEEDING = [ResourceTab, Action, MenuItem, Page] as const;

/** The layer of each registry, and how many started it: one, whoever draws the page over it (another frame, a test's page drawn again). */
const running = new WeakMap<object, { users: number; stop: () => void }>();

/** The access layer over a registry, started (one for it, however many start it: the first's cluster and mark); what it gives back stops it, once no one else holds it. */
// biome-ignore lint/suspicious/noExplicitAny: a registry of the dashboard's kinds.
export function startAccess(registry: Registry<any>, cluster: Cluster, options: { mark?: boolean } = {}): () => void {
  let held = running.get(registry);
  if (!held) {
    held = { users: 0, stop: layer(registry, cluster, options) };
    running.set(registry, held);
  }
  const it = held;
  it.users++;
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (--it.users > 0) return;
    running.delete(registry);
    it.stop();
  };
}

// biome-ignore lint/suspicious/noExplicitAny: a registry of the dashboard's kinds.
function layer(registry: Registry<any>, cluster: Cluster, options: { mark?: boolean }): () => void {
  const { source } = cluster;
  const contributor = registry.contributor('access', standingOf('access'));
  const denied: Access = options.mark ? 'marked' : 'denied';
  const lives = new Map<string, Live<AccessResult>>();
  /** The rules of a namespace (the cluster's with them), or the cluster's alone: read live. */
  const rulesOf = (namespace?: string) => {
    let live = lives.get(namespace ?? '');
    if (!live) {
      live = source.access(namespace === undefined ? {} : { namespace });
      lives.set(namespace ?? '', live);
    }
    return live.value;
  };
  let namespaces: Live<{ state: string; items: readonly { object?: KubeObject }[] }> | undefined;

  const known = definitionSignal(registry, 'Namespaces', 'default');
  /** The namespaces there are: as listed; the list refused, those one may use without it (Namespaces); none known: undefined. */
  const namespacesThere = (): readonly string[] | undefined => {
    namespaces ??= source.list<KubeObject>({ kind: 'namespaces.v1', page: { limit: MAX_NAMESPACES + 1 } });
    const list = namespaces.value;
    if (list.state === 'live') return list.items.length > MAX_NAMESPACES ? undefined : list.items.map((i) => i.object?.metadata?.name ?? '');
    const theirs = knownNamespaces(known.value?.spec as NamespacesSpec | undefined);
    return list.state === 'denied' || list.state === 'error' ? (theirs.length ? theirs : undefined) : undefined;
  };

  /** Whether it may be had anywhere: in the cluster, else in a namespace there is (undefined: not known). */
  const anywhere = (ask: AccessAsk, namespaced: boolean): boolean | undefined => {
    const whole = allowed(rulesOf(), ask);
    if (whole !== false || !namespaced) return whole;
    const there = namespacesThere();
    if (!there) return undefined;
    let unknown = false;
    for (const name of there) {
      const said = allowed(rulesOf(name), ask);
      if (said) return true;
      if (said === undefined) unknown = true;
    }
    return unknown ? undefined : false;
  };

  /**
   * What needs ask of a subject, each with whether it is of a namespace: a
   * need with a resource, that one (of a namespace); with none, the
   * subject's kind. One of the subject's own kind (its subresource too) is
   * of its object, by its name — a rule may name only it; no kind, nothing.
   */
  const asksOf = (needs: readonly Need[], subject: AccessSubject = {}): [AccessAsk, boolean][] =>
    needs.flatMap((n): [AccessAsk, boolean][] => {
      const { kind, object } = subject;
      if (!n.resource && !kind) return [];
      const group = n.group ?? (n.resource ? '' : (kind?.group ?? ''));
      const resource = n.resource ?? kind?.plural ?? '';
      const own = kind !== undefined && resource === kind.plural && group === kind.group;
      const name = own ? object?.metadata?.name : undefined;
      const ask: AccessAsk = { verb: n.verb, group, resource, ...(n.subresource ? { subresource: n.subresource } : {}), ...(name ? { name } : {}) };
      return [[ask, own ? kind.namespaced : true]];
    });

  /** Whether needs are had for a subject: in its object's namespace, else anywhere (a kind of no namespace: in the cluster). */
  const accessFor = (needs: readonly Need[]) => (subject: AccessSubject) => {
    const namespace = subject.object?.metadata?.namespace ?? subject.namespace;
    for (const [ask, namespaced] of asksOf(needs, subject)) {
      if ((namespace === undefined ? anywhere(ask, namespaced) : allowed(rulesOf(namespace), ask)) === false) return denied;
    }
    return 'allowed' as const;
  };
  /** One function for the same needs: a patch said again the same is nothing. */
  const fns = new Map<string, (subject: AccessSubject) => Access>();
  const fnOf = (needs: readonly Need[]) => {
    const key = JSON.stringify(needs);
    let fn = fns.get(key);
    if (!fn) {
      fn = accessFor(needs);
      fns.set(key, fn);
    }
    return fn;
  };
  const hide = options.mark ? { icon: 'denied' } : { hidden: true };
  // A tab across the top draws no icon: marked, the mark before its title.
  if (options.mark)
    contributor.add(
      'Fill',
      'access.nav.tabs.tab.denied',
      fill(slots.nav.tabs.tab.content, {
        order: 0,
        when: (p) => p.entry.icon === 'denied' && p.placement !== 'side',
        render: () => (
          <>
            <Icon name="denied" />{' '}
          </>
        ),
      }),
    );

  /** What it says of each definition now, by kind and name: its patch, and the same said as text (patched again only when it changes). */
  const said = new Map<string, { kind: string; name: string; text: string }>();
  const views = listSignal(registry, KindView);
  const needing = new Map(NEEDING.map((of) => [of, listSignal(registry, of)] as const));
  const stop = effect(() => {
    const want = new Map<string, { kind: string; name: string; patch: Record<string, unknown>; text: string }>();
    const kinds = cluster.discovery.kinds.value;
    for (const d of views.value) {
      const kind = kinds?.get(d.name);
      if (kind && anywhere({ verb: 'list', group: kind.group, resource: kind.plural }, kind.namespaced) === false)
        want.set(`KindView/${d.name}`, { kind: 'KindView', name: d.name, patch: hide, text: JSON.stringify(hide) });
    }
    for (const of of NEEDING) {
      for (const d of needing.get(of)?.value ?? []) {
        const needs = (d.spec as { needs?: Need[] }).needs;
        if (!needs?.length) continue;
        // A page listed in the navigation: hidden where it is had nowhere.
        const nowhere = of === Page && asksOf(needs).some(([ask, namespaced]) => anywhere(ask, namespaced) === false);
        const patch = { access: fnOf(needs), ...(nowhere ? hide : {}) };
        want.set(`${of.name}/${d.name}`, { kind: of.name, name: d.name, patch, text: JSON.stringify([needs, nowhere && hide]) });
      }
    }
    registry.batch(() => {
      for (const [key, w] of want) {
        if (said.get(key)?.text === w.text) continue;
        said.set(key, { kind: w.kind, name: w.name, text: w.text });
        contributor.patch(w.kind, w.name, w.patch as never);
      }
      for (const [key, s] of said) {
        if (want.has(key)) continue;
        said.delete(key);
        contributor.patch(s.kind, s.name, {} as never);
      }
    });
  });

  return () => {
    stop();
    contributor.dispose();
  };
}
