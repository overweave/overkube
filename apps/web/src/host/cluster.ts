import { type Connector, objectPath } from '@overkube/connector';
import type { KubeObject } from '@overkube/kube-types';
import type { GetResult, Live, Source } from '@overkube/query';
import type { ClusterRun } from '@overkube/runtime';
import { type Cluster, noReach, runReach } from '@overkube/sdk';
import { computed, untracked } from '@preact/signals';

/*
 * The cluster as addons and components see it, over the connector (what
 * the cluster serves, writes) and the source (what is read: queries) —
 * writes in an addon's name, cut off once it stops — and the facts
 * conditions test.
 */

export interface ClusterAccess {
  facts: { served(groupOrKind: string): boolean | undefined; available(apiService: string): boolean | undefined };
  /** The cluster for one addon's run: once its signal aborts (the run stopped), it writes nothing, and what is in flight is cut off; it reaches what it says alone. */
  open(run: ClusterRun): Cluster;
  /** The cluster for the page's components. */
  components(): Cluster;
}

const API_SERVICES = 'apiservices.v1.apiregistration.k8s.io';

export function clusterAccess(connector: Pick<Connector, 'discovery' | 'http'>, source: Source): ClusterAccess {
  const { discovery, http } = connector;
  const groups = computed(() => {
    const served = discovery.kinds.value;
    return served ? new Set([...served.values()].map((k) => k.group)) : null;
  });
  // An APIService asked of by a condition: read for the page's life (asked again, the same answer).
  const services = new Map<string, Live<GetResult<KubeObject>>>();

  const served = (groupOrKind: string) => {
    if (groupOrKind.includes('/')) {
      const known = discovery.kinds.value;
      return known ? known.has(groupOrKind) : undefined;
    }
    return groups.value ? groups.value.has(groupOrKind) : undefined;
  };

  const shown = { kinds: discovery.kinds, state: discovery.state, error: discovery.error, retry: () => void discovery.load() };

  const path = (kind: Parameters<typeof objectPath>[0], object: KubeObject) => objectPath(kind, object.metadata?.name ?? '', object.metadata?.namespace);

  /** Reading and writing: a run's own (its signal, its name, what it reaches) given by open(). */
  const of = (run?: ClusterRun): Cluster => {
    const signal = run?.signal;
    const fieldManager = run && `overkube-${run.id}`;
    const live = () => {
      if (signal?.aborted) throw new Error('the addon has stopped: it writes nothing more');
    };
    return {
      discovery: shown,
      source,
      served,
      status: (s) => http.status(s ?? signal),
      async patch(kind, object, change) {
        live();
        return http.patch({ path: path(kind, object), ...(fieldManager ? { fieldManager } : {}), ...change }, signal);
      },
      async remove(kind, object) {
        live();
        const uid = object.metadata?.uid;
        // This object, not one made anew under its name since it was seen: one with no uid is not sent at all.
        if (!uid) throw new Error(`${kind.id} ${object.metadata?.name ?? ''}: no uid — only an object read from the cluster is deleted`);
        await http.remove(path(kind, object), { uid }, signal);
      },
      // An addon's alone (what it says it reaches): the page's components reach no workload.
      proxy: (target) => (run ? runReach(run, target, (method, p, init) => http.reach(target, p, { method, ...init })) : noReach()),
    };
  };

  return {
    facts: {
      served,
      available(name) {
        let service = services.get(name);
        if (!service) {
          // Read for the page's life: subscribed outside whatever asks (an effect).
          const asked = source.get<KubeObject>({ kind: API_SERVICES, name });
          untracked(() => asked.subscribe(() => {}));
          services.set(name, asked);
          service = asked;
        }
        const { state, object } = service.value;
        if (state === 'loading' || state === 'error' || state === 'denied') return undefined;
        if (!object) return false;
        return (object as { status?: { conditions?: { type: string; status: string }[] } }).status?.conditions?.some((c) => c.type === 'Available' && c.status === 'True') ?? false;
      },
    },
    open: (run) => of(run),
    components: () => of(),
  };
}
