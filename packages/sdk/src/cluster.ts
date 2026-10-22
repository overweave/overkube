import type { ReachTarget, StatusAnswer } from '@overkube/gateway/protocol';
import type { KindInfo, KubeObject } from '@overkube/kube-types';
import type { QueryError, Source } from '@overkube/query';
import type { ReadonlySignal } from '@preact/signals';
import type { Found } from './addon.ts';

/*
 * The cluster, as an addon works with it — a contract: the page makes it
 * of its connector and source, a test or a story of objects in memory.
 * What is read of it is asked as queries (source: get, list, count, a
 * kind's fields — @overkube/query), answered live while read; what an
 * addon writes is in its own name (its field manager: overkube-<its id>)
 * and, once it has stopped, not at all. A kind comes first, always:
 * patch(kind, object, …).
 */

/** A change to an object, as the gateway takes it (merge, JSON patch, strategic, apply). */
export interface ObjectChange {
  type: 'merge' | 'json' | 'strategic' | 'apply';
  patch: unknown;
  /** Who makes it, as the cluster records it (default: overkube-<the addon's id>; the page's own: the gateway's). */
  fieldManager?: string;
  /** An apply: take over fields others manage. */
  force?: boolean;
  /** Only checked by the cluster, nothing changed. */
  dryRun?: boolean;
  /** Of its status, not the object (its own path, its own rights: patch on <resource>/status) — as a controller's, or a tool's, is changed. */
  subresource?: 'status';
}

/**
 * A workload's port, asked as data (the gateway's /proxy: the API server's
 * proxy, as the one signed in — RBAC decides by the method): an addon's
 * scanner, a metrics API. Its answers are data, never a page.
 */
export interface Reach {
  /** Its 2xx answer as it is, or an ApiError (its own 401 is its: the session goes on). */
  request(
    method: string,
    path: string,
    init?: { query?: Record<string, string | undefined>; body?: string; contentType?: string; accept?: string; signal?: AbortSignal },
  ): Promise<Response>;
  /** GET, its JSON (none: an empty answer). */
  get<T>(path: string, query?: Record<string, string | undefined>, signal?: AbortSignal): Promise<T | undefined>;
  /** POST of JSON, its JSON (none: an empty answer). */
  post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T | undefined>;
}

/** An answer's JSON: none when it is empty (204, no body); one that is not JSON, an error of its own (bad_json). */
async function jsonOf<T>(res: Response): Promise<T | undefined> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw Object.assign(new Error(`the answer is not JSON: ${text.slice(0, 100)}`), { status: res.status, code: 'bad_json' });
  }
}

/** A Reach of how it is asked: get and post as JSON over request. */
export function reachOver(request: Reach['request']): Reach {
  return {
    request,
    get: async (path, query, signal) => jsonOf(await request('GET', path, { ...(query ? { query } : {}), accept: 'application/json', ...(signal ? { signal } : {}) })),
    post: async (path, body, signal) =>
      jsonOf(await request('POST', path, { body: JSON.stringify(body), contentType: 'application/json', accept: 'application/json', ...(signal ? { signal } : {}) })),
  };
}

/** Whether a target is one of those said (a kind, namespace, name and port alike; any scheme). */
export const reaches = (said: readonly ReachTarget[], target: ReachTarget) =>
  said.some((t) => t.kind === target.kind && t.namespace === target.namespace && t.name === target.name && String(t.port) === String(target.port));

/** A Service's name as looked for: * any run of characters, the rest as it is. */
const named = (pattern: string) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`);

/** The names a Service looked for may have, as patterns. */
const namesOf = (spec: Found) => (typeof spec.service === 'string' ? [spec.service] : spec.service).map(named);

type Port = { port?: number; targetPort?: number | string };

/** The Service of these that is looked for, as a target: by its names in their order (the first said, the first had), its port the one asked — or the one in front of it — else its first. */
export function foundIn(services: readonly KubeObject[], spec: Found): ReachTarget | undefined {
  for (const pattern of namesOf(spec))
    for (const s of services) {
      const name = s.metadata?.name ?? '';
      if (!pattern.test(name)) continue;
      const ports = ((s as { spec?: { ports?: Port[] } }).spec?.ports ?? []).filter((p) => spec.port === undefined || p.port === spec.port || p.targetPort === spec.port);
      if (!ports[0]?.port) continue;
      return { kind: 'service', namespace: s.metadata?.namespace ?? '', name, port: ports[0].port };
    }
  return undefined;
}

/** Where a target is, said short: monitoring/vmsingle-main:8428. */
export const whereOf = (t: ReachTarget) => `${t.namespace}/${t.name}:${t.port}`;

/**
 * An addon's way to a workload (its run: its id, its life, what it says it
 * reaches, the Services its conditions look for): only to one it says, or
 * to where one of those Services is found now (found: that one, its port —
 * no other); nothing once it stopped — what is in flight then cut off too
 * (its run's signal, beside any it gives).
 */
export function runReach(
  run: { id: string; signal: AbortSignal; reaches: readonly ReachTarget[]; finds: readonly Found[] },
  target: ReachTarget,
  request: Reach['request'],
  found: (spec: Found) => ReachTarget | false | undefined,
): Reach {
  const isFound = run.finds.some((spec) => {
    const at = found(spec);
    return !!at && reaches([at], target);
  });
  if (!reaches(run.reaches, target) && !isFound)
    throw new Error(
      `addon ${run.id} reaches only what it says it does (reaches) and where the Services its conditions look for are found: not ${target.kind} ${target.namespace}/${target.name}:${target.port}`,
    );
  return reachOver(async (method, path, init = {}) => {
    if (run.signal.aborted) throw new Error(`addon ${run.id} has stopped: it reaches nothing more`);
    return request(method, path, { ...init, signal: init.signal ? AbortSignal.any([init.signal, run.signal]) : run.signal });
  });
}

/** The page's own cluster has no way to a workload: an addon reaches one from its run's (ctx.cluster), what it says it reaches. */
export function noReach(): never {
  throw new Error('a workload is reached by an addon, from its own cluster (ctx.cluster.proxy: what it says it reaches) — not the page’s');
}

/** What the cluster serves, as discovery tells it. */
export interface Discovery {
  /** Its kinds by id; null until known. */
  readonly kinds: ReadonlySignal<ReadonlyMap<string, KindInfo> | null>;
  readonly state: ReadonlySignal<'loading' | 'ready' | 'error'>;
  readonly error: ReadonlySignal<QueryError | null>;
  /** Ask again (after an error). */
  retry(): void;
}

/** How an object is replaced: its status alone; checked by the cluster only (dry run: what it would keep, nothing changed). */
export interface UpdateOptions {
  subresource?: 'status';
  dryRun?: boolean;
}

/** How an object is deleted: what of its dependents (kubectl delete --cascade: background, foreground, orphan); checked only (dry run). */
export interface RemoveOptions {
  propagationPolicy?: 'Background' | 'Foreground' | 'Orphan';
  dryRun?: boolean;
}

/** A kind's OpenAPI schema: a $ref to it among its group version's components (and those components). */
export interface KindSchema {
  $ref: string;
  components: { schemas: Record<string, unknown> };
}

/** Where a kind's group version's OpenAPI (v3) is: /openapi/v3/api/v1, /openapi/v3/apis/<group>/<version>. */
export const openapiPath = (kind: Pick<KindInfo, 'group' | 'version'>) => (kind.group ? `/openapi/v3/apis/${kind.group}/${kind.version}` : `/openapi/v3/api/${kind.version}`);

/** A kind's schema in its group version's OpenAPI document: the one its x-kubernetes-group-version-kind names. */
export function kindSchemaOf(doc: { components?: { schemas?: Record<string, unknown> } } | undefined, kind: Pick<KindInfo, 'group' | 'version' | 'kind'>): KindSchema | undefined {
  const schemas = doc?.components?.schemas;
  if (!schemas) return undefined;
  const name = Object.keys(schemas).find((n) =>
    ((schemas[n] as { 'x-kubernetes-group-version-kind'?: { group: string; version: string; kind: string }[] })['x-kubernetes-group-version-kind'] ?? []).some(
      (g) => g.group === kind.group && g.version === kind.version && g.kind === kind.kind,
    ),
  );
  return name ? { $ref: `#/components/schemas/${name}`, components: { schemas } } : undefined;
}

/** The cluster as components and addons have it (useCluster, ctx.cluster). */
export interface Cluster {
  readonly discovery: Discovery;
  /** What is read of it: queries, answered live while read (useList, useCount, useGet, useFields). */
  readonly source: Source;
  /** Whether a group ('traefik.io', '' for the core) or a kind ('v1/Pod') is served; undefined until known. */
  served(groupOrKind: string): boolean | undefined;
  status(signal?: AbortSignal): Promise<StatusAnswer>;
  patch(kind: KindInfo, object: KubeObject, change: ObjectChange): Promise<KubeObject>;
  /**
   * Replace an object — or its status (subresource) — as it is given:
   * refused (409) if it changed since it was read (its resourceVersion), as
   * a tool that updates does (cmctl renew: its status; the right to update
   * it asked, not to patch it). In the addon's name.
   */
  update(kind: KindInfo, object: KubeObject, options?: UpdateOptions): Promise<KubeObject>;
  /**
   * Delete the object seen — by its uid, not another that took its name
   * since: an object with no uid (one not read from the cluster) is refused,
   * nothing sent.
   */
  remove(kind: KindInfo, object: KubeObject, options?: RemoveOptions): Promise<void>;
  /**
   * Evict a pod, as kubectl drain does (the Eviction API: its
   * PodDisruptionBudget respected — refused, 429, while it allows no
   * disruption). Dry run: checked, nothing evicted.
   */
  evict(pod: KubeObject, options?: { dryRun?: boolean }): Promise<void>;
  /**
   * A kind's schema, as the cluster's OpenAPI (v3) says it — its components
   * beside it ($ref to them): a CRD's too. Asked once a group's version
   * (kept); none when the cluster serves none for it.
   */
  schema(kind: KindInfo): Promise<KindSchema | undefined>;
  /** A Service as looked for (an answer's): where it is (a target to reach), none (false), not known yet (undefined) — followed where read. */
  found(spec: Found): ReachTarget | false | undefined;
  /** A workload's port, as data — an addon's: only one it says it reaches (Addon.reaches), or where a Service its conditions look for is found (found()). */
  proxy(target: ReachTarget): Reach;
}
