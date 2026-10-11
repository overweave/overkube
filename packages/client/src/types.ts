import type { KindInfo, KubeObject, ObjectOf } from '@overkube/kube-types';

/**
 * - loading: nothing yet;
 * - live: listed, and kept current by its watch;
 * - stale: what is there may be behind (its stream is down, tried again);
 * - error: it cannot be had (403, 404, signed out): retry() tries again;
 * - absent: the cluster does not serve the kind (an addon's API not installed).
 */
export type CollectionState = 'loading' | 'live' | 'stale' | 'error' | 'absent';

/** A kind's objects' type: its own when the kind is one kube-types knows, else any object's. */
export type ObjectOfKind<K extends KindInfo> = [ObjectOf<K>] extends [never] ? KubeObject : ObjectOf<K>;
