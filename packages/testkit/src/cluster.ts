import type { StatusAnswer } from '@overkube/gateway/protocol';
import { type KindInfo, type KubeObject, knownKinds } from '@overkube/kube-types';
import { keyOf, type QueryError, type State } from '@overkube/query';
import { type Cluster, type FieldLayer, fieldLayers, kindRef, type ObjectChange, type ObjectOfKind } from '@overkube/sdk';
import { type MemoryState, memorySource } from '@overkube/source';
import { batch, computed, type ReadonlySignal, signal } from '@preact/signals';

/*
 * A cluster in memory, as an addon works with it (the SDK's Cluster): its
 * objects put, changed and taken away by the test, read through queries
 * answered as the page's are (a source in memory: the same fields, the same
 * answers); a kind's state set (loading, stale, error, denied); what is
 * served and available said; what the addon writes kept, applied (a merge
 * patch, a delete), or refused once, as the API server would — a delete of
 * an object not seen as it is now (another uid under its name, or none)
 * refused too.
 */

/** What an addon wrote. */
export interface Write {
  op: 'patch' | 'remove';
  /** The kind's id. */
  kind: string;
  name: string;
  namespace?: string;
  change?: ObjectChange;
}

/** A refusal, as the API server gives it. */
export interface Refusal {
  status: number;
  code: string;
  message?: string;
}

export interface FakeCluster extends Cluster {
  /** An object comes (ADDED); one under its name already is replaced. */
  add<K extends KindInfo>(kind: K, object: ObjectOfKind<K>): ObjectOfKind<K>;
  /** An object changes (MODIFIED). */
  change<K extends KindInfo>(kind: K, object: ObjectOfKind<K>): ObjectOfKind<K>;
  /** An object goes (DELETED). */
  take(kind: KindInfo, name: string, namespace?: string): void;
  get<K extends KindInfo>(kind: K, name: string, namespace?: string): ObjectOfKind<K> | undefined;
  /** A kind's answers' state, as the page would see it (an error: what the cluster said); live again: live. */
  state(kind: KindInfo, state: State, error?: Refusal): void;
  /** A group ('traefik.io') or a kind ('v1/Pod') served, or no longer. */
  serve(groupOrKind: string, served?: boolean): void;
  /** What the addon wrote, in order. */
  readonly writes: readonly Write[];
  /** The next write of this kind refused with this. */
  refuse(op: Write['op'], refusal: Refusal): void;
  /** The fields a registry's addons define (Field), asked by as the page's source asks by them: followed from now on. */
  follow(registry: Parameters<typeof fieldLayers>[0]): void;
  /** Discovery as the page would see it: not answered yet, or failed (what the cluster said); ready again with none. */
  discover(state: 'loading' | 'ready' | 'error', error?: Refusal): void;
}

export interface FakeClusterOptions {
  /** What is served: groups ('' for the core, 'apps') and kinds ('v1/Pod'). Default: every one (served() says true). */
  served?: readonly string[];
  /** Kinds the kinds table does not know (a CRD's), served beside its own. */
  kinds?: readonly KindInfo[];
}

/** A merge patch (RFC 7386) applied: null takes a field away, an object merges, anything else replaces. */
function merge(target: unknown, patch: unknown): unknown {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out: Record<string, unknown> = target && typeof target === 'object' && !Array.isArray(target) ? { ...(target as Record<string, unknown>) } : {};
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === null) delete out[k];
    else out[k] = merge(out[k], v);
  }
  return out;
}

export function fakeCluster(options: FakeClusterOptions = {}): FakeCluster {
  const served = signal<ReadonlySet<string> | null>(options.served ? new Set(options.served) : null);
  const writes: Write[] = [];
  const refusals = new Map<Write['op'], Refusal[]>();
  let version = 1;
  const discoveryState = signal<'loading' | 'ready' | 'error'>('ready');
  const discoveryError = signal<QueryError | null>(null);
  const all = [...knownKinds, ...(options.kinds ?? [])];
  // What discovery says: the kinds known (and given) that are served, once it has answered.
  const discovered = computed(() => {
    if (discoveryState.value !== 'ready') return null;
    const set = served.value;
    return new Map(all.filter((k) => set === null || set.has(k.id) || set.has(k.group)).map((k) => [k.id, k]));
  });
  // The objects, by kind's ref and key; as the source reads them, by ref.
  const kept = new Map<string, Map<string, KubeObject>>();
  const objects = signal<Readonly<Record<string, readonly KubeObject[]>>>({});
  const states = signal<Readonly<Record<string, MemoryState>>>({});
  const followed = signal<ReadonlySignal<readonly FieldLayer[]> | null>(null);
  const source = memorySource(objects, {
    kinds: options.kinds,
    states,
    layers: computed(() => followed.value?.value ?? []),
    // As its discovery says: a kind not served is not; discovery not answered yet, its answers on their way.
    serves: (kind) => discovered.value?.has(kind.id),
  });

  const of = (kind: KindInfo) => {
    const ref = kindRef(kind);
    let k = kept.get(ref);
    if (!k) {
      k = new Map();
      kept.set(ref, k);
    }
    return k;
  };
  const told = (kind: KindInfo) => {
    objects.value = { ...objects.peek(), [kindRef(kind)]: [...of(kind).values()] };
  };
  const put = (kind: KindInfo, object: KubeObject) => {
    const k = of(kind);
    const was = k.get(keyOf(object));
    // Its uid: the one it came with, the one it has (a change), or one of its own (as the API server gives).
    const uid = object.metadata?.uid ?? was?.metadata?.uid ?? `fake-${++version}`;
    const next = { ...object, metadata: { ...object.metadata, uid, resourceVersion: String(++version) } };
    k.set(keyOf(next), next);
    told(kind);
    return next;
  };
  const refused = (op: Write['op']) => {
    const r = refusals.get(op)?.shift();
    if (r) throw Object.assign(new Error(r.message ?? r.code), { status: r.status, code: r.code });
  };

  return {
    add: (kind, object) => put(kind, object as KubeObject) as never,
    change: (kind, object) => put(kind, object as KubeObject) as never,
    take(kind, name, namespace) {
      of(kind).delete(namespace ? `${namespace}/${name}` : name);
      told(kind);
    },
    get: (kind, name, namespace) => of(kind).get(namespace ? `${namespace}/${name}` : name) as never,
    state(kind, state, error) {
      const { [kindRef(kind)]: _, ...rest } = states.peek();
      states.value = state === 'live' && !error ? rest : { ...rest, [kindRef(kind)]: { state, ...(error ? { error: { ...error, message: error.message ?? error.code } } : {}) } };
    },
    serve(groupOrKind, yes = true) {
      const now = new Set(served.peek() ?? []);
      if (yes) now.add(groupOrKind);
      else now.delete(groupOrKind);
      served.value = now;
    },
    get writes() {
      return writes;
    },
    refuse(op, refusal) {
      refusals.set(op, [...(refusals.get(op) ?? []), refusal]);
    },
    follow(registry) {
      followed.value = fieldLayers(registry);
    },
    discover(state, error) {
      batch(() => {
        discoveryState.value = state;
        discoveryError.value = error ? { ...error, message: error.message ?? error.code } : null;
      });
    },

    // ── The SDK's Cluster ──
    discovery: {
      kinds: discovered,
      state: discoveryState,
      error: discoveryError,
      retry() {},
    },
    source,
    served(groupOrKind) {
      const set = served.value;
      return set === null ? true : set.has(groupOrKind);
    },
    status: async (): Promise<StatusAnswer> => ({ version: 'test', kube: { reachable: true, version: 'v1.35.7' } }),
    async patch(kind, object, change) {
      const name = object.metadata?.name ?? '';
      const namespace = object.metadata?.namespace;
      writes.push({ op: 'patch', kind: kind.id, name, ...(namespace ? { namespace } : {}), change });
      refused('patch');
      const now = (of(kind).get(keyOf(object)) ?? object) as KubeObject;
      return change.type === 'merge' ? put(kind, merge(now, change.patch) as KubeObject) : now;
    },
    async remove(kind, object) {
      const name = object.metadata?.name ?? '';
      const namespace = object.metadata?.namespace;
      const uid = object.metadata?.uid;
      // As the page's: no uid, nothing sent.
      if (!uid) throw new Error(`${kind.id} ${name}: no uid — only an object read from the cluster is deleted`);
      writes.push({ op: 'remove', kind: kind.id, name, ...(namespace ? { namespace } : {}) });
      refused('remove');
      const now = of(kind).get(keyOf(object));
      if (now?.metadata?.uid !== uid)
        throw Object.assign(new Error(`${kind.id} ${name}: not the object seen (its uid ${uid}, now ${now?.metadata?.uid ?? 'none'})`), { status: 409, code: 'Conflict' });
      this.take(kind, name, namespace);
    },
  };
}
