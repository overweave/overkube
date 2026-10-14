import type { KindInfo } from '@overkube/kube-types';
import { type ReadonlySignal, signal } from '@preact/signals';
import { ApiError, type Http } from './http.ts';

/*
 * What the cluster serves: every kind of every group and version, from the
 * aggregated discovery (Kubernetes 1.30+): two requests, /api and /apis,
 * whatever is installed. Asked again when that changes (connector.ts: a CRD or
 * an APIService comes or goes), so an addon's API shows as soon as it is
 * there. A group-version the API server marks Stale (an aggregated API whose
 * server is down: metrics-server) is left out until it is Current again.
 */

/** The aggregated discovery, asked for in the Accept header. */
const ACCEPT = 'application/json;g=apidiscovery.k8s.io;v=v2;as=APIGroupDiscoveryList';

interface DiscoveryList {
  kind?: string;
  items?: {
    metadata?: { name?: string };
    versions?: {
      version: string;
      /** Stale: the API server could not ask its server (an aggregated API down). */
      freshness?: 'Current' | 'Stale';
      resources?: {
        resource: string;
        responseKind?: { group?: string; version?: string; kind?: string };
        scope?: 'Namespaced' | 'Cluster';
        singularResource?: string;
        verbs?: string[];
        shortNames?: string[];
        categories?: string[];
        subresources?: { subresource: string }[];
      }[];
    }[];
  }[];
}

export type DiscoveryState = 'loading' | 'ready' | 'error';

export class Discovery {
  private readonly http: Http;
  private readonly kindsSignal = signal<ReadonlyMap<string, KindInfo> | null>(null);
  private readonly stateSignal = signal<DiscoveryState>('loading');
  private readonly errorSignal = signal<ApiError | null>(null);
  private readonly retryMs: number;
  private attempt = 0;
  private loading: Promise<void> | null = null;
  private again = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | null = null;
  private closed = false;

  constructor(http: Http, options: { retryMs?: number } = {}) {
    this.http = http;
    this.retryMs = options.retryMs ?? 2000;
  }

  /** Every kind served, by id ("apps/v1/Deployment"); null until first known. */
  get kinds(): ReadonlySignal<ReadonlyMap<string, KindInfo> | null> {
    return this.kindsSignal;
  }

  get state(): ReadonlySignal<DiscoveryState> {
    return this.stateSignal;
  }

  get error(): ReadonlySignal<ApiError | null> {
    return this.errorSignal;
  }

  /** Ask the cluster (again); one at a time, and once more after if asked meanwhile. */
  load(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.loading) {
      this.again = true;
      return this.loading;
    }
    clearTimeout(this.retryTimer);
    this.loading = this.fetch().finally(() => {
      this.loading = null;
      if (this.again && !this.closed) {
        this.again = false;
        void this.load();
      }
    });
    return this.loading;
  }

  /** Ask nothing more: what is on its way is dropped, nothing is tried again. */
  close(): void {
    this.closed = true;
    this.again = false;
    this.controller?.abort();
    clearTimeout(this.retryTimer);
  }

  private async fetch(): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    const signal = controller.signal;
    try {
      const [core, groups] = await Promise.all([
        this.http.request<DiscoveryList>('GET', '/api', { accept: ACCEPT, signal }),
        this.http.request<DiscoveryList>('GET', '/apis', { accept: ACCEPT, signal }),
      ]);
      if (this.closed) return;
      for (const list of [core, groups]) {
        // Not a passing trouble (no 0 status): asking again does not make the cluster newer.
        if (list.kind !== 'APIGroupDiscoveryList') throw new ApiError(426, 'old_kubernetes', 'the cluster has no aggregated discovery (Kubernetes 1.30 or newer is needed)');
      }
      // The same kinds as before: the same map (whatever follows them is not worked out again).
      const kinds = kindsOf([core, groups]);
      if (!sameKinds(this.kindsSignal.peek(), kinds)) this.kindsSignal.value = kinds;
      this.errorSignal.value = null;
      this.stateSignal.value = 'ready';
      this.attempt = 0;
    } catch (err) {
      if (this.closed || signal.aborted) return;
      // The other request of this attempt, if it is still on its way, goes too.
      controller.abort();
      const error = err instanceof ApiError ? err : new ApiError(0, 'network', (err as Error).message);
      this.errorSignal.value = error;
      // What was known stays known; only a first failure leaves nothing.
      if (!this.kindsSignal.value) this.stateSignal.value = 'error';
      if (error.passing) this.retryTimer = setTimeout(() => void this.load(), Math.min(this.retryMs * 2 ** this.attempt++, 60_000));
    }
  }
}

/** The kinds in discovery lists, as the kinds table has them; subresources left out. */
function kindsOf(lists: DiscoveryList[]): Map<string, KindInfo> {
  const kinds = new Map<string, KindInfo>();
  for (const list of lists) {
    for (const g of list.items ?? []) {
      const groupName = g.metadata?.name ?? '';
      for (const v of g.versions ?? []) {
        if (v.freshness === 'Stale') continue;
        for (const r of v.resources ?? []) {
          // Where it is listed is the group-version's own (responseKind's group and version are mostly empty).
          const group = groupName;
          const version = v.version;
          const kind = r.responseKind?.kind;
          if (!kind) continue;
          const id = `${group ? `${group}/` : ''}${version}/${kind}`;
          if (kinds.has(id)) continue;
          kinds.set(id, {
            id,
            group,
            version,
            kind,
            plural: r.resource,
            singular: r.singularResource || kind.toLowerCase(),
            namespaced: r.scope === 'Namespaced',
            verbs: r.verbs ?? [],
            ...(r.shortNames?.length ? { shortNames: r.shortNames } : {}),
            ...(r.categories?.length ? { categories: r.categories } : {}),
            ...(r.subresources?.length ? { subresources: r.subresources.map((s) => s.subresource) } : {}),
          });
        }
      }
    }
  }
  return kinds;
}

/** Whether two discoveries found the same kinds, alike, in the same order (the first version of a kind is the one preferred). */
function sameKinds(a: ReadonlyMap<string, KindInfo> | null, b: ReadonlyMap<string, KindInfo>): boolean {
  if (!a || a.size !== b.size) return false;
  const before = [...a.values()];
  return [...b.values()].every((kind, i) => JSON.stringify(before[i]) === JSON.stringify(kind));
}
