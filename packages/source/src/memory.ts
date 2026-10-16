import type { Layer } from '@overkube/cel';
import { compareLogTimes } from '@overkube/connector';
import type { CrdLike } from '@overkube/kube-fields';
import { type KindInfo, type KubeObject, knownKinds } from '@overkube/kube-types';
import {
  type CountQuery,
  type CountResult,
  checkQuery,
  entriesBefore,
  entriesOf,
  type FieldsResult,
  type GetQuery,
  type GetResult,
  type KindRef,
  kindRef,
  type ListQuery,
  type ListResult,
  type Live,
  type LogLine,
  type LogQuery,
  type LogResult,
  logWindow,
  type QueryError,
  type Result,
  readCursor,
  type Scope,
  type SearchQuery,
  type SearchResult,
  type SizeResult,
  type Source,
  type State,
  scan,
  scanCount,
} from '@overkube/query';
import { computed, type ReadonlySignal } from '@preact/signals';
import { capabilities, FieldsCache } from './fields.ts';
import { filtered, isError, makeFilter, withTold } from './filter.ts';
import { MAX_FOLLOWED } from './log.ts';
import { OwnedKinds } from './owned.ts';
import { answer, itemOf, searchedKinds } from './search.ts';

/*
 * Queries answered from objects in memory (a test's, a story's): the same
 * fields (a CRD's columns of a CRD among the objects), the same answers as
 * the page's own — live and whole, as they are now, unless a kind's state
 * is said otherwise (on its way, behind, refused: as the page would see it).
 * Containers' logs as given (followed, as the page's: its newest lines,
 * then every one written after).
 */

/** A kind's answers' state, said (with its error): loading, error and denied answer no objects; stale, those there are. */
export interface MemoryState {
  state: State;
  error?: QueryError;
}

export interface MemoryOptions {
  /** Kinds beyond those the kinds table knows (a CRD's). */
  kinds?: readonly KindInfo[];
  layers?: ReadonlySignal<readonly Layer[]>;
  /** Kinds' states, by ref (none: live). */
  states?: ReadonlySignal<Readonly<Record<KindRef, MemoryState>>>;
  /** Whether the cluster serves a kind, as its discovery says (undefined: not known yet — answers on their way); none: every one. */
  serves?: (kind: KindInfo) => boolean | undefined;
  /** Containers' logs, by logKey: followed as the signal changes. */
  logs?: ReadonlySignal<Readonly<Record<string, readonly LogLine[]>>>;
}

/** A container's log's key, of a memory source's logs: namespace/pod/container (none: its only one, ''), :previous for its last run's. */
export const logKey = (q: Pick<LogQuery, 'namespace' | 'name' | 'container' | 'previous'>) => `${q.namespace}/${q.name}/${q.container ?? ''}${q.previous ? ':previous' : ''}`;

const NO_LAYERS: readonly Layer[] = [];
const CRDS = 'customresourcedefinitions.v1.apiextensions.k8s.io';

/** A source of these objects, by their kind's ref (pods.v1): followed as the signal changes. */
export function memorySource(objects: ReadonlySignal<Readonly<Record<KindRef, readonly KubeObject[]>>>, options: MemoryOptions = {}): Source {
  const cache = new FieldsCache();
  const owning = new OwnedKinds();
  const kinds = new Map([...knownKinds, ...(options.kinds ?? [])].map((k) => [kindRef(k), k]));
  const all: Result = { state: 'live', coverage: { namespaces: 'all', denied: [] } };

  /** A kind's fields, or why there are none. */
  const fieldsOf = (ref: KindRef) => {
    const kind = kinds.get(ref);
    const served = kind && options.serves ? options.serves(kind) : kind !== undefined;
    if (served === undefined) return { loading: true, error: { code: 'loading', message: 'what the cluster serves is not known yet' } };
    if (!kind || !served) return { error: { code: 'not_served', message: `the cluster does not serve ${ref}` } };
    const crd = objects.value[CRDS]?.find((o) => o.metadata?.name === `${kind.plural}.${kind.group}`) as CrdLike | undefined;
    return { kind, made: cache.of(kind, crd, options.layers?.value ?? NO_LAYERS) };
  };
  const nothing = { namespaces: [] as string[], denied: [] as string[] };
  const failed = (error: QueryError): Result => ({ ...all, state: 'error', coverage: nothing, error });
  /** A kind not had: on its way (what is served not known yet), or why not. */
  const notHad = (f: { loading?: boolean; error: QueryError }): Result => (f.loading ? { ...all, state: 'loading', coverage: nothing } : failed(f.error));
  /** A kind's state, as said; and whether it answers objects. */
  const stateOf = (ref: KindRef): { result: Result; answers: boolean } => {
    const said = options.states?.value[ref];
    if (!said) return { result: all, answers: true };
    return {
      result: { ...all, state: said.state, ...(said.state === 'denied' || said.state === 'error' ? { coverage: nothing } : {}), ...(said.error ? { error: said.error } : {}) },
      answers: said.state === 'live' || said.state === 'stale' || said.state === 'partial',
    };
  };
  /** A kind's objects in a scope (a kind of no namespace: all of them, whatever the scope says). */
  const inScope = (ref: KindRef, scope: Scope | undefined) => {
    const of = stateOf(ref).answers ? (objects.value[ref] ?? []) : [];
    return !scope || scope === 'all' || kinds.get(ref)?.namespaced === false ? of : of.filter((o) => scope.namespaces.includes(o.metadata?.namespace ?? ''));
  };

  return {
    capabilities: capabilities(),
    get<O>(query: GetQuery): Live<GetResult<O>> {
      return computed(() => {
        const f = fieldsOf(query.kind);
        if (!f.made) return notHad(f);
        if (f.kind.namespaced && !query.namespace) return failed({ code: 'bad_query', message: `${query.kind} is of a namespace: a get query says which` });
        const object = inScope(query.kind, undefined).find((o) => o.metadata?.name === query.name && (!f.kind.namespaced || o.metadata?.namespace === query.namespace));
        return { ...stateOf(query.kind).result, ...(object ? { object: object as O } : {}) };
      });
    },
    list<O>(query: ListQuery): Live<ListResult<O>> {
      return computed(() => {
        const f = fieldsOf(query.kind);
        if (!f.made) return { ...notHad(f), items: [] };
        const wrong = checkQuery(query, f.made.fields, 'list');
        if (wrong) return { ...failed(wrong), items: [] };
        const filter = query.filter ? makeFilter(f.made, query.filter) : undefined;
        if (filter && isError(filter)) return { ...failed(filter), items: [] };
        const kept = filtered(inScope(query.kind, query.scope) as readonly O[], filter);
        return { ...stateOf(query.kind).result, ...withTold(scan(kept.objects, query, f.made.fields), kept.told()) };
      });
    },
    count(query: CountQuery): Live<CountResult> {
      return computed(() => {
        const f = fieldsOf(query.kind);
        if (!f.made) return notHad(f);
        const wrong = checkQuery(query, f.made.fields, 'count');
        if (wrong) return failed(wrong);
        const filter = query.filter ? makeFilter(f.made, query.filter) : undefined;
        if (filter && isError(filter)) return failed(filter);
        const kept = filtered(inScope(query.kind, query.scope), filter);
        return { ...stateOf(query.kind).result, ...withTold(scanCount(kept.objects, query, f.made.fields), kept.told()) };
      });
    },
    search(query: SearchQuery): Live<SearchResult> {
      return computed(() =>
        answer(query, searchedKinds(kinds.values(), kindRef), kindRef, (kind) => {
          const ref = kindRef(kind);
          const f = fieldsOf(ref);
          if (!f.made) return f.loading ? undefined : { error: f.error };
          // As its state says: on its way, refused, failed — none of it as none there.
          const { result, answers } = stateOf(ref);
          if (!answers) return result.state === 'loading' ? undefined : { error: result.error ?? { code: result.state, message: `${ref} is ${result.state}` } };
          return { items: inScope(ref, undefined).map(itemOf) };
        }),
      );
    },
    size(kind: KindRef, scope?: Scope): Live<SizeResult> {
      return computed((): SizeResult => {
        const f = fieldsOf(kind);
        if (!f.made) return f.loading ? {} : { error: f.error };
        const { result, answers } = stateOf(kind);
        if (!answers) return result.state === 'loading' ? {} : { error: result.error ?? { code: result.state, message: `${kind} is ${result.state}` } };
        return { total: { count: inScope(kind, scope).length, exact: true } };
      });
    },
    owned(kind: KindRef): Live<readonly KindRef[]> {
      let last: readonly KindRef[] = [];
      return computed(() => {
        for (const [ref, of] of Object.entries(objects.value)) owning.learn(ref, ref, of, () => of);
        const info = kinds.get(kind);
        const now = info ? owning.of(info.group, info.kind) : [];
        if (now.join() !== last.join()) last = now;
        return last;
      });
    },
    log(query: LogQuery): Live<LogResult> {
      // Followed, as the page's: its newest lines when first read, then every one written after (MAX_FOLLOWED at most).
      const follow = query.follow && !query.before && !query.previous;
      let from: number | undefined;
      return computed((): LogResult => {
        const lines = options.logs?.value[logKey(query)];
        if (!lines) return { state: 'error', lines: [], error: { code: 'not_found', message: `no log of ${logKey(query)}` } };
        const entries = entriesOf(lines);
        if (follow) {
          from ??= Math.max(0, entries.length - query.limit);
          const kept = Math.max(from, entries.length - MAX_FOLLOWED);
          return { state: 'live', ...logWindow(entries.slice(kept), MAX_FOLLOWED, kept > 0) };
        }
        const at = query.before ? readCursor(query.before) : undefined;
        const of = at ? entriesBefore(entries, at, compareLogTimes) : entries;
        return { state: 'done', ...logWindow(of, query.limit) };
      });
    },
    fields(kind: KindRef): Live<FieldsResult> {
      return computed(() => {
        const f = fieldsOf(kind);
        if (!f.made) return notHad(f);
        return { ...all, catalog: f.made.catalog, rejected: f.made.rejected, columns: f.made.columns };
      });
    },
  };
}
