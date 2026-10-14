import type { StatusAnswer } from '@overkube/gateway/protocol';
import type { KindInfo, KubeObject } from '@overkube/kube-types';
import type { QueryError, Source } from '@overkube/query';
import type { ReadonlySignal } from '@preact/signals';

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
   * Delete the object seen — by its uid, not another that took its name
   * since: an object with no uid (one not read from the cluster) is refused,
   * nothing sent.
   */
  remove(kind: KindInfo, object: KubeObject): Promise<void>;
}
