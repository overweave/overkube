import { type Connector, objectPath } from '@overkube/connector';
import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import { type GetResult, LIMITS, type ListResult, type Live, type Source } from '@overkube/query';
import type { ClusterRun } from '@overkube/runtime';
import { type Cluster, type Found, foundIn, kindSchemaOf, noReach, openapiPath, type ReachTarget, runReach } from '@overkube/sdk';
import { computed, untracked } from '@preact/signals';

const POD = kinds.core.v1.Pod;

/*
 * The cluster as addons and components see it, over the connector (what
 * the cluster serves, writes) and the source (what is read: queries) —
 * writes in an addon's name, cut off once it stops — and the facts
 * conditions test.
 */

export interface ClusterAccess {
  facts: {
    served(groupOrKind: string): boolean | undefined;
    available(apiService: string): boolean | undefined;
    /** Where a Service looked for is (a target to reach), false when none is, undefined while not known (or not to be seen). */
    found(spec: Found): ReachTarget | false | undefined;
  };
  /** The cluster for one addon's run: once its signal aborts (the run stopped), it writes nothing, and what is in flight is cut off; it reaches what it says alone. */
  open(run: ClusterRun): Cluster;
  /** The cluster for the page's components. */
  components(): Cluster;
  /** What the facts read, let go of (the page closing). */
  close(): void;
}

const API_SERVICES = 'apiservices.v1.apiregistration.k8s.io';
const SERVICES = 'services.v1';

export function clusterAccess(connector: Pick<Connector, 'discovery' | 'http'>, source: Source): ClusterAccess {
  const { discovery, http } = connector;
  const groups = computed(() => {
    const served = discovery.kinds.value;
    return served ? new Set([...served.values()].map((k) => k.group)) : null;
  });
  // An APIService asked of by a condition: read for the page's life (asked again, the same answer).
  const services = new Map<string, Live<GetResult<KubeObject>>>();
  // The cluster's Services, once a condition looks for one.
  let list: Live<ListResult<KubeObject>> | undefined;
  // What the facts read, held till close().
  const held: (() => void)[] = [];

  const served = (groupOrKind: string) => {
    if (groupOrKind.includes('/')) {
      const known = discovery.kinds.value;
      return known ? known.has(groupOrKind) : undefined;
    }
    return groups.value ? groups.value.has(groupOrKind) : undefined;
  };

  const shown = { kinds: discovery.kinds, state: discovery.state, error: discovery.error, retry: () => void discovery.load() };

  const found = (spec: Found): ReachTarget | false | undefined => {
    if (!list) {
      // Read for the page's life, once a condition looks for one: subscribed outside whatever asks (an effect).
      list = source.list<KubeObject>({ kind: SERVICES, page: { limit: LIMITS.page } });
      const asked = list;
      untracked(() => held.push(asked.subscribe(() => {})));
    }
    const { state, items, next } = list.value;
    const where = foundIn(
      items.flatMap((i) => (i.object ? [i.object] : [])),
      spec,
    );
    if (where) return where;
    // Not seen at all yet, not to be seen, or more than one window of them: not known; seen (all of it, or what may be): none.
    return state === 'loading' || state === 'error' || state === 'denied' || next !== undefined ? undefined : false;
  };

  const path = (kind: Parameters<typeof objectPath>[0], object: KubeObject) => objectPath(kind, object.metadata?.name ?? '', object.metadata?.namespace);

  // Each group version's OpenAPI document, asked once (kept for the page's life: what a kind is does not change as it runs) —
  // none there (404, or not to be read) kept as none; one that failed otherwise, asked again next time.
  const documents = new Map<string, Promise<{ components?: { schemas?: Record<string, unknown> } } | undefined>>();
  const schemaOf = async (kind: KindInfo) => {
    const at = openapiPath(kind);
    let doc = documents.get(at);
    if (!doc) {
      doc = http.get<{ components?: { schemas?: Record<string, unknown> } }>(at).catch((error: unknown) => {
        const status = (error as { status?: number })?.status;
        if (status !== 404 && status !== 403) documents.delete(at);
        return undefined;
      });
      documents.set(at, doc);
    }
    return kindSchemaOf(await doc, kind);
  };

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
      found,
      status: (s) => http.status(s ?? signal),
      async patch(kind, object, change) {
        live();
        const { subresource, ...body } = change;
        return http.patch({ path: `${path(kind, object)}${subresource ? `/${subresource}` : ''}`, ...(fieldManager ? { fieldManager } : {}), ...body }, signal);
      },
      async update(kind, object, options = {}) {
        live();
        const at = `${path(kind, object)}${options.subresource ? `/${options.subresource}` : ''}`;
        const query = { ...(fieldManager ? { fieldManager } : {}), ...(options.dryRun ? { dryRun: 'All' } : {}) };
        return http.request<KubeObject>('PUT', at, { body: object, query, ...(signal ? { signal } : {}) });
      },
      async remove(kind, object, options = {}) {
        live();
        const uid = object.metadata?.uid;
        // This object, not one made anew under its name since it was seen: one with no uid is not sent at all.
        if (!uid) throw new Error(`${kind.id} ${object.metadata?.name ?? ''}: no uid — only an object read from the cluster is deleted`);
        await http.remove(
          path(kind, object),
          { uid, ...(options.propagationPolicy ? { propagationPolicy: options.propagationPolicy } : {}), ...(options.dryRun ? { dryRun: 'All' as const } : {}) },
          signal,
        );
      },
      async evict(pod, options = {}) {
        live();
        const name = pod.metadata?.name ?? '';
        const namespace = pod.metadata?.namespace ?? '';
        await http.request('POST', `${objectPath(POD, name, namespace)}/eviction`, {
          body: { apiVersion: 'policy/v1', kind: 'Eviction', metadata: { name, namespace }, ...(options.dryRun ? { deleteOptions: { dryRun: ['All'] } } : {}) },
          ...(signal ? { signal } : {}),
        });
      },
      schema: (kind) => schemaOf(kind),
      // An addon's alone (what it says it reaches): the page's components reach no workload.
      proxy: (target) => (run ? runReach(run, target, (method, p, init) => http.reach(target, p, { method, ...init }), found) : noReach()),
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
          untracked(() => held.push(asked.subscribe(() => {})));
          services.set(name, asked);
          service = asked;
        }
        const { state, object } = service.value;
        if (state === 'loading' || state === 'error' || state === 'denied') return undefined;
        if (!object) return false;
        return (object as { status?: { conditions?: { type: string; status: string }[] } }).status?.conditions?.some((c) => c.type === 'Available' && c.status === 'True') ?? false;
      },
      found,
    },
    open: (run) => of(run),
    components: () => of(),
    close() {
      for (const release of held.splice(0)) release();
    },
  };
}
