import { preferredKinds } from '@overkube/connector';
import type { KindInfo } from '@overkube/kube-types';
import { holdsTo, type KindRef, parseLoose, type QueryError, rankOf, type SearchGroup, type SearchItem, type SearchQuery, type SearchResult } from '@overkube/query';
import { refusedBy } from './errors.ts';

/*
 * A search of every kind: each kind once (its version preferred), Events
 * aside (many, gone in minutes), the usual kinds first; matched as loosely
 * as typed (@overkube/query's parseLoose: words in a name, a label
 * selector — the same a filter of what is found keeps), a kind's name first
 * (po web: only that kind's, said so). Nothing listed of nothing typed, nor
 * of a word of one letter.
 */

/** How long a kind's list is kept fresh. */
export const SEARCH_MS = 60_000;
/** How many of a kind are read at most. */
export const SEARCH_MAX = 2000;
/** Kinds left out: many, gone in minutes. */
const LEFT_OUT = new Set(['events.v1', 'events.v1.events.k8s.io']);
/** The kinds looked through first (the rest after, by name). */
const FIRST = [
  'pods.v1',
  'deployments.v1.apps',
  'statefulsets.v1.apps',
  'daemonsets.v1.apps',
  'jobs.v1.batch',
  'cronjobs.v1.batch',
  'services.v1',
  'ingresses.v1.networking.k8s.io',
  'configmaps.v1',
  'secrets.v1',
  'persistentvolumeclaims.v1',
  'nodes.v1',
  'namespaces.v1',
];

/** A kind's objects as had: its items (more there than read: truncated; some namespaces not allowed: partial), or why there are none. */
export type Had = { items: readonly SearchItem[]; truncated?: boolean; partial?: boolean } | { error: QueryError };

/** An object as found: its name, namespace, labels. */
export function itemOf(o: { metadata?: { name?: string; namespace?: string; labels?: Record<string, string> } }): SearchItem {
  const m = o.metadata ?? {};
  return { name: m.name ?? '', ...(m.namespace ? { namespace: m.namespace } : {}), ...(m.labels ? { labels: m.labels } : {}) };
}

/** The kinds a search looks through: each once (its version preferred), those that may be listed, Events aside, the usual ones first, the rest by name. */
export function searchedKinds(kinds: Iterable<KindInfo>, refOf: (k: KindInfo) => KindRef): KindInfo[] {
  const order = (k: KindInfo) => {
    const at = FIRST.indexOf(refOf(k));
    return at < 0 ? FIRST.length : at;
  };
  return preferredKinds(kinds)
    .filter((k) => k.verbs.includes('list') && !LEFT_OUT.has(refOf(k)))
    .sort((a, b) => order(a) - order(b) || a.kind.localeCompare(b.kind) || refOf(a).localeCompare(refOf(b)));
}

/** What is typed: a kind's name first (more after it: of that kind only — its plural, its kind, a short name), the rest. */
export function kindFirst(text: string, kinds: readonly KindInfo[], refOf: (k: KindInfo) => KindRef): { only?: KindRef; rest: string } {
  const rest = text.trim();
  const first = /^(\S+)\s+(.+)$/.exec(rest);
  if (!first) return { rest };
  const said = first[1].toLowerCase();
  const kind = kinds.find((k) => k.plural === said || k.kind.toLowerCase() === said || (k.shortNames ?? []).includes(said));
  return kind ? { only: refOf(kind), rest: first[2] } : { rest };
}

/** Nothing found yet: of these kinds, as typed. */
const none = (matched: string, words: readonly string[], kinds: number, only?: KindRef): SearchResult => ({
  groups: [],
  matched,
  words,
  ...(only ? { only } : {}),
  searched: 0,
  kinds,
  denied: [],
  failed: [],
  partial: [],
  truncated: [],
});

/** A search's answer, of each kind's objects (as had: none, on their way) — none asked of nothing typed, nor of a word of one letter. */
export function answer(query: SearchQuery, kinds: readonly KindInfo[], refOf: (k: KindInfo) => KindRef, had: (k: KindInfo) => Had | undefined): SearchResult {
  const per = query.per ?? 5;
  const { only, rest } = kindFirst(query.text, kinds, refOf);
  const looked = only ? kinds.filter((k) => refOf(k) === only) : kinds;
  const loose = parseLoose(rest);
  const words = loose && 'words' in loose ? loose.words : [];
  // Nothing to look for yet: no kind looked through, none to be (not "0 of 62": nothing is on its way).
  if (!loose || ('words' in loose && words.join('').length < 2)) return none(rest, words, 0, only);
  const within = query.scope && query.scope !== 'all' ? new Set(query.scope.namespaces) : undefined;
  const rank = (item: SearchItem) => ('selector' in loose ? (holdsTo(loose.selector, item.labels) ? 0 : undefined) : rankOf(words, item.name));
  const groups: (SearchGroup & { best: number; order: number })[] = [];
  const result = none(rest, words, looked.length, only) as SearchResult & { denied: KindRef[]; failed: KindRef[]; partial: KindRef[]; truncated: KindRef[]; searched: number };
  looked.forEach((kind, order) => {
    const got = had(kind);
    if (!got) return;
    result.searched++;
    if ('error' in got) {
      (refusedBy(got.error) ? result.denied : result.failed).push(refOf(kind));
      return;
    }
    if (got.truncated) result.truncated.push(refOf(kind));
    if (got.partial) result.partial.push(refOf(kind));
    const found: { item: SearchItem; rank: number }[] = [];
    for (const item of got.items) {
      if (within && kind.namespaced && !within.has(item.namespace ?? '')) continue;
      const r = rank(item);
      if (r !== undefined) found.push({ item, rank: r });
    }
    if (!found.length) return;
    found.sort((a, b) => a.rank - b.rank || a.item.name.localeCompare(b.item.name) || (a.item.namespace ?? '').localeCompare(b.item.namespace ?? ''));
    groups.push({ kind: refOf(kind), total: found.length, items: found.slice(0, per).map((f) => f.item), best: found[0].rank, order });
  });
  groups.sort((a, b) => a.best - b.best || a.order - b.order);
  return { ...result, groups: groups.map(({ best, order, ...g }) => g) };
}
