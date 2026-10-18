import type { Layer } from '@overkube/cel';
import { type Connector, type Counted, type Feed, type FeedHold, type FeedSpec, feedKey } from '@overkube/connector';
import type { CrdLike } from '@overkube/kube-fields';
import { type KindInfo, type KubeObject, kinds as known } from '@overkube/kube-types';
import {
  type AccessQuery,
  type AccessResult,
  type AccessRule,
  type CountQuery,
  type CountResult,
  canonical,
  checkQuery,
  type FieldError,
  type FieldsResult,
  type GetQuery,
  type GetResult,
  type KindRef,
  kindRef,
  type ListQuery,
  type ListResult,
  type Live,
  type LogQuery,
  type LogResult,
  type Ordered,
  ordered,
  type QueryError,
  type Result,
  type Scope,
  type SearchItem,
  type SearchQuery,
  type SearchResult,
  type SizeResult,
  type Source,
  scan,
  scanCount,
  type Where,
  windowOf,
} from '@overkube/query';
import { computed, effect, type ReadonlySignal, type Signal, signal, untracked } from '@preact/signals';
import { queryErrorOf, refusedBy } from './errors.ts';
import { bindJoins, capabilities, FieldsCache, type KindFields } from './fields.ts';
import { filtered, isError, type MadeFilter, makeFilter, ticking, withTold } from './filter.ts';
import { type Held, Kept } from './kept.ts';
import { pageLog } from './log.ts';
import { OwnedKinds } from './owned.ts';
import { Queue } from './queue.ts';
import { answer, itemOf, SEARCH_MAX, SEARCH_MS, searchedKinds } from './search.ts';

/** How long a kind's count (not watched) is kept fresh. */
const SIZE_MS = 60_000;
/** How long what the one signed in may do is kept fresh. */
const ACCESS_MS = 5 * 60_000;
/** A namespace none can be (a ":" in it): a review there tells the cluster's rules alone. */
const NO_NAMESPACE = 'overkube:cluster';

/** A SelfSubjectRulesReview's answer, what of it is read. */
interface RulesReview {
  status?: { resourceRules?: AccessRule[]; incomplete?: boolean };
}

/*
 * Queries answered by the page, from the cluster's data as it watches it.
 * A query is planned onto feeds — the fewest that hold what it asks, the
 * API server told as much of where as it takes (a namespace, a name):
 * - a kind of no namespace: a feed of it all;
 * - every namespace: a feed of every one; one the user may not list so
 *   (403): one feed for each namespace there is (the namespaces' own feed;
 *   one the user may not list either: those given) — the ones not allowed,
 *   denied, the rest answered (partial);
 * - some namespaces: a feed of every one others hold, on its way or in
 *   (only those namespaces of it read: theirs changing, a new answer), held
 *   weakly while read — kept, never let go under it, but never keeping the
 *   whole cluster's for a few namespaces once others let it go — else a
 *   feed for each;
 * - one object: a feed others hold that has it, else a feed of it by name.
 * Its fields: the kind's (FieldsCache), a CRD's columns of its CRD as it is
 * now. Planned again as what it depends on changes (discovery, a CRD,
 * the namespaces, a 403, a feed others hold coming or going); a new plan
 * is taken once its feeds are in (none loading), the old one read till then
 * (its feeds held meanwhile) — no gap, no list shown empty. Held while it
 * is read (subscribed to), its feeds let go after; answered by a scan
 * whenever it is read after its plan or its feeds changed — not before (a
 * page reading it once a frame scans once). A pod's log: log.ts.
 */

export interface SourceOptions {
  /** Namespaces to ask one by one when the user may list a kind neither in every namespace nor list the namespaces (those they said they use): read where they are used, as they change (a signal's). */
  namespaces?: () => readonly string[];
  /** Fields (and CEL functions) addons add, over the kinds' own: read as they change (a new array: every kind's fields made anew). */
  layers?: ReadonlySignal<readonly Layer[]>;
  /** The most namespaces asked one by one when every one cannot be (default 150: the stream's watches are few); past them, partial. */
  maxNamespaces?: number;
}

/** A feed a plan reads, and the namespaces it reads of it (none: all of it). */
interface Part {
  feed: Feed;
  only?: ReadonlySet<string>;
  /** The namespace a feed of one namespace is of (denied: that one). */
  namespace?: string;
}

/** What a joined field reads: another kind's feeds (of the namespaces the plan reads), its fields. */
interface Joined {
  from: KindRef;
  parts: readonly Part[];
  fields: KindFields;
}

/** What a query reads (or why nothing); n: which plan of the query it is (in its revision). */
type Plan = (
  | { readonly parts?: undefined; readonly state: 'loading' | 'error' | 'denied'; readonly error?: QueryError }
  | {
      readonly parts: readonly Part[];
      readonly fields: KindFields;
      readonly namespaces: 'all' | readonly string[];
      readonly skipped?: number;
      /** The kinds its joined fields read. */
      readonly joins?: readonly Joined[];
    }
) & { readonly n?: number };

const LOADING: Plan = { state: 'loading' };
const NO_LAYERS: readonly Layer[] = [];
const CRD = known.apiextensions.v1.CustomResourceDefinition;
const NAMESPACE = known.core.v1.Namespace;

type Ask = { as: 'get'; query: GetQuery } | { as: 'list'; query: ListQuery } | { as: 'count'; query: CountQuery } | { as: 'fields'; query: { kind: KindRef } };

export function createSource(connector: Connector, options: SourceOptions = {}): Source {
  const fields = new FieldsCache();
  // What kinds own what kinds, learned from the objects its feeds read.
  const owning = new OwnedKinds();
  const owners = new Map<KindRef, Live<readonly KindRef[]>>();
  // What is asked once of the cluster, a few at a time — counts (in sight) first, a search's lists after — and kept a while.
  const queue = new Queue();
  const counts = new Kept<Counted>({ queue, lane: 'now', ttl: SIZE_MS });
  const lists = new Kept<{ items: readonly SearchItem[]; truncated: boolean }>({ queue, lane: 'later', ttl: SEARCH_MS });
  const rules = new Kept<{ rules: readonly AccessRule[]; incomplete: boolean }>({ queue, lane: 'now', ttl: ACCESS_MS });
  /** The queries read now, by what they ask. */
  const lives = new Map<string, Live<unknown>>();
  /** Lists ordered whole, by query (its window aside) and what it read: windows of one query read of it while its objects are as they were. */
  const orderings = new Map<string, { stamp: string; page: string; ordered?: Ordered<unknown> }>();
  /** CRDs read whole by name, again when their metadata says they changed (their generation): no watch of each. */
  const crdsRead = new Map<string, Signal<{ asked?: string; generation?: string; crd?: CrdLike; error?: QueryError }>>();
  const maxNamespaces = options.maxNamespaces ?? 150;

  /** A CRD as last read whole, read again (by GET) when its generation is another than the one read. */
  const crdOf = (name: string, meta: KubeObject) => {
    const generation = String(meta.metadata?.generation ?? meta.metadata?.resourceVersion ?? '');
    let read = crdsRead.get(name);
    if (!read) {
      read = signal({});
      crdsRead.set(name, read);
    }
    const now = read.value;
    if (now.asked !== generation) {
      const into = read;
      untracked(() => {
        into.value = { ...now, asked: generation };
        connector.http
          .get<CrdLike>(`/apis/apiextensions.k8s.io/v1/customresourcedefinitions/${name}`)
          .then((crd) => {
            if (into.peek().asked === generation) into.value = { asked: generation, generation, crd };
          })
          .catch((e: unknown) => {
            if (into.peek().asked === generation) into.value = { ...into.peek(), error: queryErrorOf(e as never) };
          });
      });
    }
    return now;
  };
  const byRef = new WeakMap<ReadonlyMap<string, KindInfo>, Map<string, KindInfo>>();
  const caps = capabilities();

  /** The kinds served, by ref. */
  const kindOf = (ref: string): KindInfo | undefined | null => {
    const kinds = connector.discovery.kinds.value;
    if (!kinds) return null;
    let index = byRef.get(kinds);
    if (!index) {
      index = new Map([...kinds.values()].map((k) => [kindRef(k), k]));
      byRef.set(kinds, index);
    }
    return index.get(ref);
  };

  /** A query held while read: planned (its feeds held) from when it is first read till it is no longer. */
  function live<T>(ask: Ask, answer: (plan: Plan) => T): Live<T> {
    // The same query asked again while one is read (its parts in any order): that one (one plan, one answer worked out, however many read it).
    const key = canonical(ask);
    const had = lives.get(key);
    if (had) return had as Live<T>;
    const plan = signal<Plan>(LOADING);
    let stop: (() => void) | null = null;
    const made: Live<T> = computed(() => answer(plan.value), {
      watched() {
        lives.set(key, made);
        stop = planning(ask, plan);
      },
      unwatched() {
        stop?.();
        stop = null;
        if (lives.get(key) === made) lives.delete(key);
      },
    });
    return made;
  }

  /** Plan a query, and again as what it depends on changes, into plan; its end: the function given back. */
  function planning(ask: Ask, plan: { value: Plan }): () => void {
    let current: Plan = LOADING;
    let n = 0;
    type Held = { hold: FeedHold; weak: boolean };
    /** What it holds, by feed key; what the run going on keeps; what the plan in use reads. */
    let held = new Map<string, Held>();
    let wanted = new Map<string, Held>();
    let used = new Set<string>();
    /** A feed the plan reads, held: one it held already, or a new one. */
    const want = (spec: FeedSpec): Feed => {
      const key = feedKey(spec);
      const had = wanted.get(key) ?? held.get(key);
      const entry = had && !had.weak ? had : { hold: connector.feeds.use(spec), weak: false };
      wanted.set(key, entry);
      return entry.hold.feed;
    };
    /**
     * A feed others hold (this query's own hold aside), not in error (on its
     * way too: it is read once in): held weakly while read — never let go
     * under it, never taken by others for held.
     */
    const borrow = (spec: FeedSpec): Feed | undefined => {
      const key = feedKey(spec);
      const own = wanted.get(key) ?? held.get(key);
      const feed = connector.feeds.find(spec);
      if (!feed || feed.state.value === 'error' || connector.feeds.holders(spec) - (own && !own.weak ? 1 : 0) <= 0) return undefined;
      wanted.set(key, own && own.hold.feed === feed ? own : { hold: connector.feeds.use(spec, { weak: true }), weak: true });
      return feed;
    };
    const dispose = effect(() => {
      wanted = new Map();
      const made = make(ask, want, borrow);
      if (ready(made, current)) {
        // Taken (a plan the same as the one in use: kept, its answer not worked out again).
        if (!same(made, current)) plan.value = current = { ...made, n: ++n };
        used = new Set(wanted.keys());
      } else {
        // Not in yet: the plan in use read (its feeds kept, those it borrows too) till it is.
        for (const key of used) {
          const e = held.get(key);
          if (e && !wanted.has(key)) wanted.set(key, e);
        }
      }
      // What it keeps no more, let go (after the rest is held: one both had and kept stays).
      const kept = new Set([...wanted.values()].map((e) => e.hold));
      for (const e of held.values()) if (!kept.has(e.hold)) e.hold.release();
      held = wanted;
    });
    return () => {
      dispose();
      for (const e of held.values()) e.hold.release();
      held = new Map();
    };
  }

  /** A kind's fields, a CRD's kind's of its CRD as it is now — or, that not known yet, on its way (or why not). */
  function fieldsFor(kind: KindInfo): KindFields | Plan {
    let crd: CrdLike | undefined;
    if (kind.group) {
      const crds = connector.feeds.find({ kind: CRD, projection: 'metadata' });
      const name = `${kind.plural}.${kind.group}`;
      crds?.revision.value;
      const meta = crds?.objects.get(name);
      if (meta) {
        const read = crdOf(name, meta);
        // Its columns as last read: the CRD read again once it changed (till then, those it had).
        crd = read.crd;
        if (!crd) return read.error ? { state: 'error', error: read.error } : LOADING;
        // Not known yet whether it is one — unless the CRDs cannot be had (refused): then it is taken as none, its own columns aside.
      } else if (crds && !crds.whole.value && crds.state.value !== 'error') return LOADING;
    }
    return fields.of(kind, crd, options.layers?.value ?? NO_LAYERS);
  }

  /**
   * A query's plan: its feeds, and — for the joined fields it asks by (its
   * sort, where, select, sums, the fields its filter reads) — the other
   * kinds' (a feed of all of one others hold, else of the namespaces it
   * reads), its fields bound to them. Another kind not served, its fields
   * not known yet, or its feed failed: none of those values.
   */
  function make(ask: Ask, want: (spec: FeedSpec) => Feed, borrow: (spec: FeedSpec) => Feed | undefined): Plan {
    const plan = partsOf(ask, want, borrow);
    if (!plan.parts || ask.as === 'fields' || ask.as === 'get' || !plan.fields.joined.size) return plan;
    const { filter, ...rest } = ask.query;
    const asked = canonical(rest);
    const made = filter ? makeFilter(plan.fields, filter) : undefined;
    const used = [...plan.fields.joined].filter(([name]) => asked.includes(JSON.stringify(name)) || (made && !isError(made) && made.reads.has(name)));
    if (!used.length) return plan;
    const joins = [...new Set(used.map(([, j]) => j.from))].flatMap((from): Joined[] => {
      const kind = kindOf(from);
      const theirs = kind ? fieldsFor(kind) : undefined;
      if (!kind || !theirs || !('ref' in theirs)) return [];
      const every: FeedSpec = { kind };
      const cover = plan.namespaces === 'all' || !kind.namespaced ? undefined : borrow(every);
      const parts: Part[] =
        plan.namespaces === 'all' || !kind.namespaced
          ? [{ feed: want(every) }]
          : cover
            ? [{ feed: cover, only: new Set(plan.namespaces) }]
            : plan.namespaces.map((namespace) => ({ feed: want({ kind, namespace }), namespace }));
      return [{ from, parts, fields: theirs }];
    });
    const way = joins.map((j) => `${j.from}:${j.parts.map((p) => `${idOf(p.feed)}${p.only ? `:${[...p.only].join(',')}` : ''}`).join(',')}:${idOf(j.fields)}`).join(';');
    const bound = bindJoins(
      plan.fields,
      (from) => {
        const j = joins.find((x) => x.from === from);
        return (
          j && {
            find: (key) => {
              // A feed failed (refused, gone): none of what it had.
              for (const { feed } of j.parts) if (feed.state.value !== 'error' && feed.objects.has(key)) return feed.objects.get(key);
              return undefined;
            },
            fields: () => j.fields,
          }
        );
      },
      way,
    );
    return { ...plan, fields: bound, joins };
  }

  function partsOf(ask: Ask, want: (spec: FeedSpec) => Feed, borrow: (spec: FeedSpec) => Feed | undefined): Plan {
    const { query } = ask;
    const kind = kindOf(query.kind);
    if (kind === null) {
      const failed = connector.discovery.state.value === 'error';
      return failed ? { state: 'error', error: queryErrorOf(connector.discovery.error.value) } : LOADING;
    }
    if (!kind) return { state: 'error', error: { code: 'not_served', message: `the cluster does not serve ${query.kind}` } };

    const made = fieldsFor(kind);
    if (!('ref' in made)) return made;
    if (ask.as === 'fields') return { parts: [], fields: made, namespaces: 'all' };
    const wrong = checkQuery(query, made.fields, ask.as);
    if (wrong) return { state: 'error', error: wrong };
    // A filter that is none (where it is wrong in it): said so before anything is asked of the cluster.
    const filter = ask.as === 'get' ? undefined : ask.query.filter && makeFilter(made, ask.query.filter);
    if (filter && isError(filter)) return { state: 'error', error: filter };
    // An object of a kind in namespaces is had by its namespace and name.
    if (ask.as === 'get' && kind.namespaced && !ask.query.namespace)
      return { state: 'error', error: { code: 'bad_query', message: `${query.kind} is of a namespace: a get query says which` } };

    const every: FeedSpec = { kind };
    if (ask.as === 'get') {
      const { namespace, name } = ask.query;
      const scoped = kind.namespaced && namespace ? { namespace } : {};
      const cover = borrow(every) ?? (namespace && kind.namespaced ? borrow({ kind, namespace }) : undefined);
      return { parts: [{ feed: cover ?? want({ kind, ...scoped, name }) }], fields: made, namespaces: kind.namespaced && namespace ? [namespace] : 'all' };
    }
    // One object by its name (where core.name is it), in one namespace or of none: as a get — a feed others hold that has it, else one of it alone.
    const named = nameIn(ask.query.where);
    const scope0 = ask.query.scope;
    const one = !kind.namespaced ? undefined : scope0 && scope0 !== 'all' && new Set(scope0.namespaces).size === 1 ? scope0.namespaces[0] : null;
    if (named !== undefined && one !== null) {
      const cover = borrow(every) ?? (one ? borrow({ kind, namespace: one }) : undefined);
      const feed = cover ?? want({ kind, ...(one ? { namespace: one } : {}), name: named });
      return { parts: [{ feed, ...(one && cover ? { only: new Set([one]) } : {}) }], fields: made, namespaces: one ? [one] : 'all' };
    }
    if (!kind.namespaced) return { parts: [{ feed: want(every) }], fields: made, namespaces: 'all' };

    const scope: Scope = ask.query.scope ?? 'all';
    if (scope !== 'all') {
      const names = [...new Set(scope.namespaces)];
      const cluster = borrow(every);
      if (cluster) return { parts: [{ feed: cluster, only: new Set(names) }], fields: made, namespaces: names };
      return { parts: names.map((namespace) => ({ feed: want({ kind, namespace }), namespace })), fields: made, namespaces: names };
    }
    // Every namespace: a feed of all of them, held even when refused (refused again, it is not asked again).
    const cluster = want(every);
    if (!forbidden(cluster)) return { parts: [{ feed: cluster }], fields: made, namespaces: 'all' };
    // Its namespaces: those there are; may not be listed, those given; none of them, it is denied.
    const spaces = want({ kind: NAMESPACE, projection: 'metadata' });
    spaces.revision.value;
    if (spaces.state.value === 'loading') return LOADING;
    if (spaces.state.value === 'error' && !forbidden(spaces)) return { state: 'error', error: queryErrorOf(spaces.error.value) };
    const names = forbidden(spaces) ? [...new Set(options.namespaces?.() ?? [])] : [...spaces.objects.values()].map((o) => o.metadata?.name ?? '').filter(Boolean);
    if (forbidden(spaces) && names.length === 0) return { state: 'denied', error: queryErrorOf(cluster.error.value) };
    // More than may be watched one by one: the first of them (by name), the rest not had — said so (partial).
    const asked = names.length > maxNamespaces ? [...names].sort().slice(0, maxNamespaces) : names;
    return {
      parts: asked.map((namespace) => ({ feed: want({ kind, namespace }), namespace })),
      fields: made,
      namespaces: asked,
      ...(asked.length < names.length ? { skipped: names.length - asked.length } : {}),
    };
  }

  /**
   * A list's window: of its query ordered whole, when another window of it
   * was asked of its objects as they are now (scrolled: no scan again);
   * else a scan of that window alone (its first, or its objects changed).
   */
  function listOf(plan: Plan & { parts: readonly Part[] }, query: ListQuery) {
    // The objects its filter keeps (the query as it is asked: its where, its cursors), what it could not be worked out of told.
    const made = plan.fields;
    const keeps = filterOf(made, query.filter);
    const scanned = <R extends { fieldErrors?: Readonly<Record<string, FieldError>> }>(answer: (objects: Iterable<KubeObject>) => R) => {
      const f = filtered(objectsOf(plan.parts), keeps);
      return withTold(answer(f.objects), f.told());
    };
    const { page, select, ...base } = query;
    const key = `${idOf(made)}|${plan.parts.map((p) => `${idOf(p.feed)}${p.only ? `:${[...p.only].join(',')}` : ''}`).join(';')}|${canonical(base)}`;
    // Its objects as they are now (a filter of now: time as it goes too).
    // The other kinds its joined fields read, as they are now too.
    const joined = (plan.joins ?? []).flatMap((j) => j.parts.map((p) => p.feed.revision.value)).join('.');
    const stamp = `${plan.parts.map((p) => (p.only ? [...p.only].map((ns) => p.feed.revisionIn(ns).value).join(':') : p.feed.revision.value)).join('.')}|${joined}${keeps?.timed ? `@${ticking()}` : ''}`;
    const pageKey = canonical(page);
    const was = orderings.get(key);
    if (was && was.stamp === stamp) {
      if (!was.ordered && was.page !== pageKey) was.ordered = scanned((objects) => ordered(objects, base, made.fields));
      if (was.ordered) return windowOf(was.ordered, query, made.fields);
    } else {
      orderings.delete(key);
      orderings.set(key, { stamp, page: pageKey });
      // A few kept: the queries read now.
      if (orderings.size > 32) orderings.delete(orderings.keys().next().value as string);
    }
    return scanned((objects) => scan(objects, query, made.fields));
  }

  /** A query's filter, made (its plan checked it is one); none: not filtered. */
  function filterOf(fields: KindFields, filter: string | undefined): MadeFilter | undefined {
    const made = filter ? makeFilter(fields, filter) : undefined;
    return made && !isError(made) ? made : undefined;
  }

  /** What keeps every one-shot answer back: the page signed out (none asked till it is loaded again), what the cluster serves not known. */
  function troubleOf(): QueryError | undefined {
    if (connector.session.value === 'expired') return { code: 'unauthorized', message: 'signed out: sign in again and reload the page' };
    if (connector.discovery.state.value === 'error') return queryErrorOf(connector.discovery.error.value);
    return undefined;
  }

  /** A kind's objects as a feed already had has them (live or stale; whole or its metadata; of every namespace, or of this one): none, not watched. */
  function watched(kind: KindInfo, namespace?: string): KubeObject[] | undefined {
    const specs: FeedSpec[] = [
      { kind },
      { kind, projection: 'metadata' },
      ...(namespace
        ? [
            { kind, namespace },
            { kind, namespace, projection: 'metadata' as const },
          ]
        : []),
    ];
    for (const spec of specs) {
      const feed = connector.feeds.find(spec);
      const state = feed?.state.value;
      if (!feed || (state !== 'live' && state !== 'stale')) continue;
      feed.revision.value;
      const all = [...feed.objects.values()];
      return namespace && !spec.namespace ? all.filter((o) => o.metadata?.namespace === namespace) : all;
    }
    return undefined;
  }

  /** The namespaces one may ask of one by one (every one refused): those there are (as listed, kept), else those given (theirs refused); so many at most — those past them skipped. */
  function namespacesAsked(): { names: string[]; skipped: number } | { error: QueryError } | undefined {
    const spaces = watched(NAMESPACE);
    const listed = spaces
      ? { value: { items: spaces.map(itemOf), truncated: false } }
      : lists.read(`${NAMESPACE.id}|names`, (signal) =>
          connector.list(NAMESPACE, { projection: 'metadata', signal }).then((l) => ({ items: l.items.map(itemOf), truncated: l.truncated })),
        );
    if (!listed) return undefined;
    // Not listed for another reason than a refusal: that is the trouble (not the kind's).
    if ('error' in listed && !refusedBy(listed.error)) return { error: listed.error };
    const all = [...new Set('error' in listed ? (options.namespaces?.() ?? []) : listed.value.items.map((i) => i.name))].sort();
    return { names: all.slice(0, maxNamespaces), skipped: Math.max(0, all.length - maxNamespaces) };
  }

  /** A kind's one-shot answers gathered: its items, whether there were more than read, whether some of it was not had (refused, skipped). */
  type Gathered<T extends { items: readonly unknown[] }> = { items: T['items'][number][]; truncated: boolean; partial: boolean; parts: T[] };

  /**
   * A kind's one-shot answers gathered, as the planner asks feeds: of every
   * namespace (refused: namespace by namespace — of the scope's, else of
   * those there are; some refused or skipped: partial), or (each: a count,
   * not to be filtered after) of the scope's namespaces each; none yet: on
   * its way.
   */
  function gathered<T extends { items: readonly unknown[]; truncated: boolean }>(
    kind: KindInfo,
    scope: Scope | undefined,
    one: (namespace: string | undefined) => Held<T> | undefined,
    how: { each: boolean },
  ): Gathered<T> | { error: QueryError } | undefined {
    const merge = (parts: (Held<T> | undefined)[], skipped = 0): Gathered<T> | { error: QueryError } | undefined => {
      if (parts.some((p) => !p)) return undefined;
      const had = parts.filter((p): p is { value: T } => !!p && 'value' in p);
      const refused = parts.filter((p) => p && 'error' in p && refusedBy(p.error));
      const other = parts.find((p): p is { error: QueryError } => !!p && 'error' in p && !refusedBy(p.error));
      if (other) return { error: other.error };
      if (!had.length) return { error: (parts[0] as { error: QueryError }).error };
      return {
        items: had.flatMap((p) => p.value.items),
        truncated: had.some((p) => p.value.truncated),
        partial: refused.length > 0 || skipped > 0,
        parts: had.map((p) => p.value),
      };
    };
    const scoped = kind.namespaced && scope && scope !== 'all' ? [...new Set(scope.namespaces)] : undefined;
    if (scoped && how.each) return merge(scoped.map((ns) => one(ns)));
    const whole = one(undefined);
    if (!whole || !kind.namespaced || !('error' in whole) || !refusedBy(whole.error)) return merge([whole]);
    // Refused of every namespace: of each one may be allowed (the scope's, else those there are).
    if (scoped) return merge(scoped.map((ns) => one(ns)));
    const asked = namespacesAsked();
    if (!asked) return undefined;
    if ('error' in asked) return asked;
    if (!asked.names.length) return { error: whole.error };
    return merge(
      asked.names.map((ns) => one(ns)),
      asked.skipped,
    );
  }

  return {
    capabilities: caps,
    search(query: SearchQuery): Live<SearchResult> {
      return computed((): SearchResult => {
        const kinds = connector.discovery.kinds.value;
        const trouble = troubleOf();
        if (!kinds || trouble) return { ...answer(query, [], kindRef, () => undefined), ...(trouble ? { error: trouble } : { loading: true }) };
        return answer(query, searchedKinds(kinds.values(), kindRef), kindRef, (kind) => {
          const list = (namespace?: string) =>
            lists.read(`${kind.id}|${namespace ?? ''}`, (signal) =>
              connector
                .list(kind, { projection: 'metadata', max: SEARCH_MAX, ...(namespace ? { namespace } : {}), signal })
                .then((l) => ({ items: l.items.map(itemOf), truncated: l.truncated })),
            );
          // Of every namespace first (the scope's filtered after, as found): namespace by namespace only where refused.
          return gathered(
            kind,
            query.scope,
            (namespace) => {
              const feed = watched(kind, namespace);
              if (feed) return { value: { items: feed.map(itemOf), truncated: false } };
              return list(namespace);
            },
            { each: false },
          );
        });
      });
    },
    log(query: LogQuery): Live<LogResult> {
      // The pod it is of, as the page watches it: its runs, its start.
      return pageLog(connector, () => this.get({ kind: 'pods.v1', namespace: query.namespace, name: query.name }), query, troubleOf);
    },
    access(query: AccessQuery): Live<AccessResult> {
      return computed((): AccessResult => {
        if (connector.session.value === 'expired') return { state: 'error', rules: [], error: { code: 'unauthorized', message: 'signed out: sign in again and reload the page' } };
        // The cluster's own (its reviews): as the one signed in.
        const held = rules.read(query.namespace ?? '', (signal) =>
          connector.http
            .request<RulesReview>('POST', '/apis/authorization.k8s.io/v1/selfsubjectrulesreviews', {
              body: { apiVersion: 'authorization.k8s.io/v1', kind: 'SelfSubjectRulesReview', spec: { namespace: query.namespace ?? NO_NAMESPACE } },
              signal,
            })
            .then((r) => ({ rules: r.status?.resourceRules ?? [], incomplete: r.status?.incomplete === true })),
        );
        if (!held) return { state: 'loading', rules: [] };
        if ('error' in held) return { state: 'error', rules: [], error: held.error };
        return { state: 'live', rules: held.value.rules, ...(held.value.incomplete ? { incomplete: true } : {}) };
      });
    },
    size(kind: KindRef, scope?: Scope): Live<SizeResult> {
      return computed((): SizeResult => {
        // Not to be asked (signed out, what the cluster serves not known): said so — not on its way for ever.
        const trouble = troubleOf();
        if (trouble) return { error: trouble };
        const info = kindOf(kind);
        if (info === null) return {};
        if (!info) return { error: { code: 'not_served', message: `the cluster does not serve ${kind}` } };
        const got = gathered(
          info,
          scope,
          (namespace) => {
            const feed = watched(info, namespace);
            if (feed) return { value: { items: feed, truncated: false, counted: { count: feed.length, exact: true } } };
            const counted = counts.read(`${info.id}|${namespace ?? ''}`, (signal) => connector.count(info, { ...(namespace ? { namespace } : {}), signal }));
            return counted && ('error' in counted ? counted : { value: { items: [], truncated: false, counted: counted.value } });
          },
          { each: true },
        );
        if (!got) return {};
        if ('error' in got) return { error: got.error };
        const all = got.parts.map((p) => p.counted as Counted);
        const count = all.reduce((n, c) => n + c.count, 0);
        return { total: { count, exact: !got.partial && all.every((c) => c.exact), ...(got.partial || all.some((c) => c.atLeast) ? { atLeast: true } : {}) } };
      });
    },
    owned(kind: KindRef): Live<readonly KindRef[]> {
      // One for each kind, whoever asks: its kind (as discovery has it) found apart from what changes often.
      const had = owners.get(kind);
      if (had) return had;
      const of = computed(() => kindOf(kind) ?? undefined);
      let last: readonly KindRef[] = [];
      const live = computed(() => {
        // The feeds read: what their objects' owners are learned of (each again only as it changes, a while apart).
        for (const feed of connector.feeds.all()) owning.learn(feed.key, kindRef(feed.spec.kind), feed.revision.value, () => feed.objects.values());
        const k = of.value;
        const now = k ? owning.of(k.group, k.kind) : [];
        if (now.join() !== last.join()) last = now;
        return last;
      });
      owners.set(kind, live);
      return live;
    },
    fields(kind: KindRef): Live<FieldsResult> {
      return live({ as: 'fields', query: { kind } }, (plan) => {
        const status = statusOf(plan);
        return plan.parts ? { ...status, catalog: plan.fields.catalog, rejected: plan.fields.rejected, columns: plan.fields.columns } : status;
      });
    },
    get<O>(query: GetQuery): Live<GetResult<O>> {
      return live({ as: 'get', query }, (plan) => {
        const status = statusOf(plan);
        if (!plan.parts) return status;
        // Of no namespace (a namespace given for it, not taken): by its name.
        const key = plan.namespaces === 'all' ? query.name : `${query.namespace}/${query.name}`;
        const object = plan.parts[0].feed.objects.get(key) as O | undefined;
        return { ...status, ...(object ? { object } : {}) };
      });
    },
    list<O>(query: ListQuery): Live<ListResult<O>> {
      return live({ as: 'list', query }, (plan) => {
        const status = statusOf(plan);
        if (!plan.parts) return { ...status, items: [] };
        return { ...status, ...listOf(plan, query) } as ListResult<O>;
      });
    },
    count(query: CountQuery): Live<CountResult> {
      return live({ as: 'count', query }, (plan) => {
        const status = statusOf(plan);
        if (!plan.parts) return status;
        // How many of all of them: as many as there are (no scan).
        if (!query.where && !query.filter && query.groupBy === undefined && query.sum === undefined) return { ...status, total: { count: sizeOf(plan.parts), exact: true } };
        const f = filtered(objectsOf(plan.parts), filterOf(plan.fields, query.filter));
        return { ...status, ...withTold(scanCount(f.objects, query, plan.fields.fields), f.told()) };
      });
    },
  };
}

/** The name a where holds an object to (core.name eq it, alone or among all of an and), if it does. */
function nameIn(where: Where | undefined): string | undefined {
  if (!where) return undefined;
  if ('field' in where) return where.field === 'core.name' && where.op === 'eq' && typeof where.value === 'string' ? where.value : undefined;
  if (where.op === 'and')
    for (const w of where.args) {
      const n = nameIn(w);
      if (n !== undefined) return n;
    }
  return undefined;
}

/** Whether a plan can be taken: nothing in use yet, an error, or its feeds in (none loading) — else the one in use is read till it is. */
function ready(made: Plan, current: Plan): boolean {
  // Nothing in use, or nothing of it to show (all of it refused): no reason to wait.
  if (!current.parts || current.parts.every((p) => p.feed.state.value === 'error')) return true;
  if (!made.parts) return made.state === 'error';
  return [...made.parts, ...(made.joins ?? []).flatMap((j) => j.parts)].every((p) => p.feed.state.value !== 'loading');
}

/** Whether two plans read the same: the same feeds, as much of each, the same fields (or the same trouble). */
function same(a: Plan, b: Plan): boolean {
  if (!a.parts || !b.parts) return !a.parts && !b.parts && a.state === b.state && a.error?.code === b.error?.code && a.error?.message === b.error?.message;
  const only = (p: Part) => (p.only ? [...p.only].join() : undefined);
  const joins = (p: Plan & { parts: readonly Part[] }) => (p.joins ?? []).map((j) => `${j.from}:${j.parts.map((x) => idOf(x.feed)).join(',')}`).join(';');
  return (
    a.fields === b.fields &&
    joins(a) === joins(b) &&
    String(a.namespaces) === String(b.namespaces) &&
    a.parts.length === b.parts.length &&
    a.parts.every((p, i) => p.feed === b.parts[i].feed && p.namespace === b.parts[i].namespace && only(p) === only(b.parts[i]))
  );
}

/** Refused: the user may not (403). */
const forbidden = (feed: Feed) => feed.state.value === 'error' && feed.error.value?.status === 403;

/** How a plan's answer is doing: its feeds' states (read: the answer follows them), what of the cluster it covers. */
function statusOf(plan: Plan): Result {
  if (!plan.parts) return { state: plan.state, coverage: { namespaces: [], denied: [] }, revision: `${plan.n ?? 0}`, ...(plan.error ? { error: plan.error } : {}) };
  const denied: string[] = [];
  let error: QueryError | undefined;
  /** Why some of it may be behind or not in yet (a stream down, waiting for room): the first such, its namespace said. */
  let behind: QueryError | undefined;
  let loading = false;
  let stale = false;
  const revisions: number[] = [plan.n ?? 0];
  for (const part of plan.parts) {
    // Of those namespaces only: their revisions (another namespace's change, no new answer).
    if (part.only) for (const namespace of part.only) revisions.push(part.feed.revisionIn(namespace).value);
    else revisions.push(part.feed.revision.value);
    const state = part.feed.state.value;
    const why = part.feed.error.value;
    if (state === 'error') {
      if (part.namespace !== undefined && forbidden(part.feed)) denied.push(part.namespace);
      else error ??= queryErrorOf(why);
    } else {
      if (state === 'loading') loading = true;
      else if (state === 'stale') stale = true;
      if (why && !behind) behind = { ...queryErrorOf(why), ...(part.namespace !== undefined ? { message: `${part.namespace}: ${why.message}` } : {}) };
    }
  }
  // The kinds its joined fields read: theirs changing, a new answer (their trouble not its: their values none).
  for (const j of plan.joins ?? []) for (const p of j.parts) revisions.push(p.feed.revision.value);
  const namespaces = plan.namespaces === 'all' ? 'all' : plan.namespaces.filter((n) => !denied.includes(n));
  let state: Result['state'] =
    error !== undefined
      ? 'error'
      : plan.parts.length > 0 && denied.length === plan.parts.length
        ? 'denied'
        : loading
          ? 'loading'
          : stale
            ? 'stale'
            : denied.length
              ? 'partial'
              : 'live';
  // Namespaces past those that may be watched: partial, said so.
  if (plan.skipped && state === 'live') state = 'partial';
  if (plan.skipped && !error && !behind) behind = { code: 'too_many_namespaces', message: `${plan.skipped} more namespaces not watched: narrow the scope` };
  const told = error ?? behind;
  return { state, coverage: { namespaces, denied }, revision: revisions.join('.'), ...(told ? { error: told } : {}) };
}

/** The objects of a plan's feeds, those of the namespaces each is read for. */
function* objectsOf(parts: readonly Part[]): Iterable<KubeObject> {
  for (const { feed, only } of parts) {
    if (!only) yield* feed.objects.values();
    else for (const namespace of only) yield* feed.inNamespace(namespace).values();
  }
}

/** How many objects a plan's feeds have, of the namespaces each is read for. */
function sizeOf(parts: readonly Part[]): number {
  let n = 0;
  for (const { feed, only } of parts) {
    if (!only) n += feed.objects.size;
    else for (const namespace of only) n += feed.inNamespace(namespace).size;
  }
  return n;
}

/** An object's number, while it lives (what keys are made of: one feed, one catalog, not another of the same name). */
const ids = new WeakMap<object, number>();
let lastId = 0;
function idOf(o: object): number {
  let id = ids.get(o);
  if (id === undefined) {
    id = ++lastId;
    ids.set(o, id);
  }
  return id;
}
