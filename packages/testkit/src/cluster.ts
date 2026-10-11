import type { CollectionState, CollectionView, ObjectOfKind } from '@overkube/client';
import type { StatusAnswer } from '@overkube/gateway/protocol';
import type { KindInfo, KubeObject } from '@overkube/kube-types';
import type { Cluster, ObjectChange } from '@overkube/sdk';
import { batch, type Signal, signal } from '@preact/signals';
import { keyOf } from './make.ts';

/*
 * A cluster in memory, as an addon works with it (the SDK's Cluster): its
 * objects put, changed and taken away by the test, as a watch tells them; a
 * kind's state set (loading, stale, error, absent); what is served and
 * available said; what the addon writes kept, applied (a merge patch, a
 * delete), or refused once, as the API server would — a delete of an object
 * not seen as it is now (another uid under its name, or none) refused too.
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

interface Kept {
  kind: KindInfo;
  items: Signal<ReadonlyMap<string, KubeObject>>;
  state: Signal<CollectionState>;
  error: Signal<Refusal | null>;
}

export interface FakeCluster extends Cluster {
  /** An object comes (ADDED); one under its name already is replaced. */
  add<K extends KindInfo>(kind: K, object: ObjectOfKind<K>): ObjectOfKind<K>;
  /** An object changes (MODIFIED). */
  change<K extends KindInfo>(kind: K, object: ObjectOfKind<K>): ObjectOfKind<K>;
  /** An object goes (DELETED). */
  take(kind: KindInfo, name: string, namespace?: string): void;
  get<K extends KindInfo>(kind: K, name: string, namespace?: string): ObjectOfKind<K> | undefined;
  /** A kind's state, as the page would see it (an error: what the cluster said). */
  state(kind: KindInfo, state: CollectionState, error?: Refusal): void;
  /** A group ('traefik.io') or a kind ('v1/Pod') served, or no longer. */
  serve(groupOrKind: string, served?: boolean): void;
  /** What the addon wrote, in order. */
  readonly writes: readonly Write[];
  /** The next write of this kind refused with this. */
  refuse(op: Write['op'], refusal: Refusal): void;
  /** The kinds held now (by an addon's run, a component), by id. */
  held(): string[];
}

export interface FakeClusterOptions {
  /** What is served: groups ('' for the core, 'apps') and kinds ('v1/Pod'). Default: every one (served() says true). */
  served?: readonly string[];
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
  const kinds = new Map<string, Kept>();
  const served = signal<ReadonlySet<string> | null>(options.served ? new Set(options.served) : null);
  const holds = new Map<string, number>();
  const writes: Write[] = [];
  const refusals = new Map<Write['op'], Refusal[]>();
  let version = 1;

  const kept = (kind: KindInfo): Kept => {
    let k = kinds.get(kind.id);
    if (!k) {
      k = { kind, items: signal(new Map()), state: signal('live'), error: signal(null) };
      kinds.set(kind.id, k);
    }
    return k;
  };
  const view = <K extends KindInfo>(kind: K) => {
    const k = kept(kind);
    return { kind, items: k.items, state: k.state, error: k.error, retry() {} } as unknown as CollectionView<ObjectOfKind<K>>;
  };
  const put = (kind: KindInfo, object: KubeObject) => {
    const k = kept(kind);
    const was = k.items.peek().get(keyOf(object));
    // Its uid: the one it came with, the one it has (a change), or one of its own (as the API server gives).
    const uid = object.metadata?.uid ?? was?.metadata?.uid ?? `fake-${++version}`;
    const next = { ...object, metadata: { ...object.metadata, uid, resourceVersion: String(++version) } };
    k.items.value = new Map(k.items.peek()).set(keyOf(next), next);
    return next;
  };
  const refused = (op: Write['op']) => {
    const r = refusals.get(op)?.shift();
    if (r) throw Object.assign(new Error(r.message ?? r.code), { status: r.status, code: r.code });
  };
  const hold = (kind: KindInfo) => {
    holds.set(kind.id, (holds.get(kind.id) ?? 0) + 1);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const n = (holds.get(kind.id) ?? 1) - 1;
      if (n) holds.set(kind.id, n);
      else holds.delete(kind.id);
    };
  };

  return {
    add: (kind, object) => put(kind, object as KubeObject) as never,
    change: (kind, object) => put(kind, object as KubeObject) as never,
    take(kind, name, namespace) {
      const k = kept(kind);
      const next = new Map(k.items.peek());
      next.delete(namespace ? `${namespace}/${name}` : name);
      k.items.value = next;
    },
    get: (kind, name, namespace) =>
      kept(kind)
        .items.peek()
        .get(namespace ? `${namespace}/${name}` : name) as never,
    state(kind, state, error) {
      const k = kept(kind);
      batch(() => {
        k.state.value = state;
        k.error.value = error ?? null;
      });
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
    held: () => [...holds.keys()].sort(),

    // ── The SDK's Cluster ──
    collection: (kind) => view(kind),
    peek: (kind) => view(kind),
    hold,
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
      const now = (kept(kind).items.peek().get(keyOf(object)) ?? object) as KubeObject;
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
      const now = kept(kind).items.peek().get(keyOf(object));
      if (now?.metadata?.uid !== uid)
        throw Object.assign(new Error(`${kind.id} ${name}: not the object seen (its uid ${uid}, now ${now?.metadata?.uid ?? 'none'})`), { status: 409, code: 'Conflict' });
      this.take(kind, name, namespace);
    },
  };
}
