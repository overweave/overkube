import { type Client, type Collection, type ObjectOfKind, objectPath } from '@overkube/client';
import { kinds } from '@overkube/kube-types';
import type { Cluster, ComponentCluster } from '@overkube/sdk';
import { computed, untracked } from '@preact/signals';

/*
 * The cluster as addons see it (ctx.cluster), over the client: a kind's
 * objects (held in an addon's run, let go of when it stops), writes (in the
 * addon's name, cut off when it stops), what the cluster serves — and the
 * facts their conditions test. Components have it without collection():
 * what they hold, they hold while drawn.
 */

export interface ClusterAccess {
  facts: { served(groupOrKind: string): boolean | undefined; available(apiService: string): boolean | undefined };
  /** The cluster for one addon's run: what it holds goes with its scope; once its signal aborts (the run stopped), it writes nothing, and what is in flight is cut off. */
  open(run: Run): Cluster;
  /** The cluster for the page's components. */
  components(): ComponentCluster;
}

/** An addon's run, as the cluster is opened for it. */
export interface Run {
  /** Its id: its writes' field manager is overkube-<id>. */
  id: string;
  /** Kept until the run stops; what it gives back drops it (let go of before). */
  onDispose(dispose: () => void): () => void;
  signal: AbortSignal;
}

export function clusterAccess(client: Client): ClusterAccess {
  const { discovery, store, api } = client;
  const groups = computed(() => {
    const served = discovery.kinds.value;
    return served ? new Set([...served.values()].map((k) => k.group)) : null;
  });
  // The APIServices: held for the page's life, once a condition asks (a peek would be let go of, and forgotten).
  let apiServices: Collection<ObjectOfKind<typeof kinds.apiregistration.v1.APIService>> | undefined;

  const served = (groupOrKind: string) => {
    if (groupOrKind.includes('/')) {
      const known = discovery.kinds.value;
      return known ? known.has(groupOrKind) : undefined;
    }
    return groups.value ? groups.value.has(groupOrKind) : undefined;
  };

  const path = (kind: Parameters<typeof objectPath>[0], object: { metadata?: { name?: string; namespace?: string } }) =>
    objectPath(kind, object.metadata?.name ?? '', object.metadata?.namespace);

  /** Reading and writing, as anyone has them: a run's own signal (and name) given by open(). */
  const base = (signal?: AbortSignal, fieldManager?: string): ComponentCluster => {
    const live = () => {
      if (signal?.aborted) throw new Error('the addon has stopped: it writes nothing more');
    };
    return {
      peek: (kind) => store.peek(kind),
      hold(kind) {
        const held = store.use(kind);
        return () => held.release();
      },
      served,
      status: (s) => api.status(s ?? signal),
      async patch(kind, object, change) {
        live();
        return api.patch({ path: path(kind, object), ...(fieldManager ? { fieldManager } : {}), ...change }, signal);
      },
      async remove(kind, object) {
        live();
        const uid = object.metadata?.uid;
        // This object, not one made anew under its name since it was seen: one with no uid is not sent at all.
        if (!uid) throw new Error(`${kind.id} ${object.metadata?.name ?? ''}: no uid — only an object read from the cluster is deleted`);
        await api.remove(path(kind, object), { uid }, signal);
      },
    };
  };

  return {
    facts: {
      served,
      available(name) {
        // Taken outside whatever asks (an effect): holding is not reading.
        apiServices ??= untracked(() => store.use(kinds.apiregistration.v1.APIService));
        const state = apiServices.state.value;
        if (state === 'absent') return false;
        if (state === 'loading') return undefined;
        const service = apiServices.items.value.get(name);
        if (!service) return state === 'error' ? undefined : false;
        return service.status?.conditions?.some((c) => c.type === 'Available' && c.status === 'True') ?? false;
      },
    },
    open(run) {
      const cluster = base(run.signal, `overkube-${run.id}`);
      return {
        ...cluster,
        collection(kind) {
          const held = store.use(kind);
          run.onDispose(() => held.release());
          return held;
        },
        // Held until let go, or until the run stops, whichever is first — let go of, it is the run's no more.
        hold(kind) {
          const release = cluster.hold(kind);
          let done = false;
          const drop = run.onDispose(() => {
            done = true;
            release();
          });
          return () => {
            if (done) return;
            done = true;
            drop();
            release();
          };
        },
      };
    },
    components: () => base(),
  };
}
