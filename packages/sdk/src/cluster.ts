import type { CollectionView, ObjectOfKind } from '@overkube/client';
import type { StatusAnswer } from '@overkube/gateway/protocol';
import type { KindInfo, KubeObject } from '@overkube/kube-types';

/*
 * The cluster, as an addon works with it — a contract, not the client: the
 * page makes it of @overkube/client, a test or a story of a fake. What an
 * addon holds through it is let go of when the addon stops; what it writes
 * is in its own name (its field manager: overkube-<its id>) and, once it
 * has stopped, not at all. A kind comes first, always: patch(kind, object, …).
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

/** The cluster as components have it (useCluster): a kind's objects held only while drawn (useCollection, hold), never for good. */
export interface ComponentCluster {
  /** A kind's objects without holding them: what is there now. */
  peek<K extends KindInfo>(kind: K): CollectionView<ObjectOfKind<K>>;
  /** Hold a kind's objects until the returned function is called (a component while it is drawn). */
  hold(kind: KindInfo): () => void;
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

/** The cluster as an addon has it (ctx.cluster). */
export interface Cluster extends ComponentCluster {
  /** A kind's objects, held until the addon stops — a kind not served yet is a collection all the same: loading, then absent or its objects. */
  collection<K extends KindInfo>(kind: K): CollectionView<ObjectOfKind<K>>;
}
