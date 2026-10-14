import { type Connector, type Feed, type FeedHold, type FeedSpec, feedKey } from '@overkube/connector';
import type { CrdLike } from '@overkube/kube-fields';
import { type KindInfo, type KubeObject, kinds as known } from '@overkube/kube-types';
import {
  type CountQuery,
  type CountResult,
  checkQuery,
  type FieldCatalog,
  type FieldName,
  type GetQuery,
  type GetResult,
  type KindRef,
  type ListQuery,
  type ListResult,
  type Live,
  type QueryError,
  type Result,
  type Scope,
  type Source,
  scan,
  scanCount,
} from '@overkube/query';
import { computed, effect, signal } from '@preact/signals';
import { capabilities, FieldsCache, type KindFields, refOf } from './fields.ts';

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
 * page reading it once a frame scans once).
 */

export interface SourceOptions {
  /** Namespaces to ask one by one when the user may list a kind neither in every namespace nor list the namespaces (a kubeconfig's namespace, say). */
  namespaces?: readonly string[];
}

/** A kind's fields as its queries are answered by them (a CRD's columns of its CRD as it is now): their definitions, those left out and why. */
export interface FieldsResult extends Result {
  catalog?: FieldCatalog;
  rejected?: Readonly<Record<FieldName, string>>;
}

export interface PageSource extends Source {
  /** A kind's fields (by its ref: pods.v1), live. */
  fields(kind: KindRef): Live<FieldsResult>;
}

/** A feed a plan reads, and the namespaces it reads of it (none: all of it). */
interface Part {
  feed: Feed;
  only?: ReadonlySet<string>;
  /** The namespace a feed of one namespace is of (denied: that one). */
  namespace?: string;
}

/** What a query reads (or why nothing); n: which plan of the query it is (in its revision). */
type Plan = (
  | { readonly parts?: undefined; readonly state: 'loading' | 'error' | 'denied'; readonly error?: QueryError }
  | { readonly parts: readonly Part[]; readonly fields: KindFields; readonly namespaces: 'all' | readonly string[] }
) & { readonly n?: number };

const LOADING: Plan = { state: 'loading' };
const CRD = known.apiextensions.v1.CustomResourceDefinition;
const NAMESPACE = known.core.v1.Namespace;

type Ask = { as: 'get'; query: GetQuery } | { as: 'list'; query: ListQuery } | { as: 'count'; query: CountQuery } | { as: 'fields'; query: { kind: KindRef } };

export function createSource(connector: Connector, options: SourceOptions = {}): PageSource {
  const fields = new FieldsCache();
  const byRef = new WeakMap<ReadonlyMap<string, KindInfo>, Map<string, KindInfo>>();
  const caps = capabilities();

  /** The kinds served, by ref. */
  const kindOf = (ref: string): KindInfo | undefined | null => {
    const kinds = connector.discovery.kinds.value;
    if (!kinds) return null;
    let index = byRef.get(kinds);
    if (!index) {
      index = new Map([...kinds.values()].map((k) => [refOf(k), k]));
      byRef.set(kinds, index);
    }
    return index.get(ref);
  };

  /** A query held while read: planned (its feeds held) from when it is first read till it is no longer. */
  function live<T>(ask: Ask, answer: (plan: Plan) => T): Live<T> {
    const plan = signal<Plan>(LOADING);
    let stop: (() => void) | null = null;
    return computed(() => answer(plan.value), {
      watched() {
        stop = planning(ask, plan);
      },
      unwatched() {
        stop?.();
        stop = null;
      },
    });
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

  function make(ask: Ask, want: (spec: FeedSpec) => Feed, borrow: (spec: FeedSpec) => Feed | undefined): Plan {
    const { query } = ask;
    const kind = kindOf(query.kind);
    if (kind === null) {
      const failed = connector.discovery.state.value === 'error';
      return failed ? { state: 'error', error: errorOf(connector.discovery.error.value) } : LOADING;
    }
    if (!kind) return { state: 'error', error: { code: 'not_served', message: `the cluster does not serve ${query.kind}` } };

    // A CRD's kind: its fields of its CRD as it is now.
    let crd: CrdLike | undefined;
    if (kind.group) {
      const crds = connector.feeds.find({ kind: CRD, projection: 'metadata' });
      const name = `${kind.plural}.${kind.group}`;
      crds?.revision.value;
      if (crds?.objects.has(name)) {
        const own = want({ kind: CRD, name });
        own.revision.value;
        crd = own.objects.get(name) as CrdLike | undefined;
        if (!crd) return own.state.value === 'error' ? { state: 'error', error: errorOf(own.error.value) } : LOADING;
      } else if (crds && !crds.whole.value) return LOADING;
    }
    const made = fields.of(kind, crd);
    if (ask.as === 'fields') return { parts: [], fields: made, namespaces: 'all' };
    const wrong = checkQuery(query, made.fields, ask.as);
    if (wrong) return { state: 'error', error: wrong };
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
    if (spaces.state.value === 'error' && !forbidden(spaces)) return { state: 'error', error: errorOf(spaces.error.value) };
    const names = forbidden(spaces) ? [...new Set(options.namespaces ?? [])] : [...spaces.objects.values()].map((o) => o.metadata?.name ?? '').filter(Boolean);
    if (forbidden(spaces) && names.length === 0) return { state: 'denied', error: errorOf(cluster.error.value) };
    return { parts: names.map((namespace) => ({ feed: want({ kind, namespace }), namespace })), fields: made, namespaces: names };
  }

  return {
    capabilities: caps,
    fields(kind: KindRef): Live<FieldsResult> {
      return live({ as: 'fields', query: { kind } }, (plan) => {
        const status = statusOf(plan);
        return plan.parts ? { ...status, catalog: plan.fields.catalog, rejected: plan.fields.rejected } : status;
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
        return { ...status, ...scan(objectsOf(plan.parts) as Iterable<O>, query, plan.fields.fields) };
      });
    },
    count(query: CountQuery): Live<CountResult> {
      return live({ as: 'count', query }, (plan) => {
        const status = statusOf(plan);
        if (!plan.parts) return status;
        return { ...status, ...scanCount(objectsOf(plan.parts), query, plan.fields.fields) };
      });
    },
  };
}

/** Whether a plan can be taken: nothing in use yet, an error, or its feeds in (none loading) — else the one in use is read till it is. */
function ready(made: Plan, current: Plan): boolean {
  // Nothing in use, or nothing of it to show (all of it refused): no reason to wait.
  if (!current.parts || current.parts.every((p) => p.feed.state.value === 'error')) return true;
  if (!made.parts) return made.state === 'error';
  return made.parts.every((p) => p.feed.state.value !== 'loading');
}

/** Whether two plans read the same: the same feeds, as much of each, the same fields (or the same trouble). */
function same(a: Plan, b: Plan): boolean {
  if (!a.parts || !b.parts) return !a.parts && !b.parts && a.state === b.state && a.error?.code === b.error?.code && a.error?.message === b.error?.message;
  const only = (p: Part) => (p.only ? [...p.only].join() : undefined);
  return (
    a.fields === b.fields &&
    String(a.namespaces) === String(b.namespaces) &&
    a.parts.length === b.parts.length &&
    a.parts.every((p, i) => p.feed === b.parts[i].feed && p.namespace === b.parts[i].namespace && only(p) === only(b.parts[i]))
  );
}

/** Refused: the user may not (403). */
const forbidden = (feed: Feed) => feed.state.value === 'error' && feed.error.value?.status === 403;

const errorOf = (e: { status: number; code: string; message: string } | null | undefined): QueryError =>
  e ? { status: e.status, code: e.code, message: e.message } : { code: 'unknown', message: 'something went wrong' };

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
      else error ??= errorOf(why);
    } else {
      if (state === 'loading') loading = true;
      else if (state === 'stale') stale = true;
      if (why && !behind) behind = { ...errorOf(why), ...(part.namespace !== undefined ? { message: `${part.namespace}: ${why.message}` } : {}) };
    }
  }
  const namespaces = plan.namespaces === 'all' ? 'all' : plan.namespaces.filter((n) => !denied.includes(n));
  const state =
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
