/**
 * Kubernetes object types. The kinds' types are generated from a cluster's
 * OpenAPI schemas (make kube-types) and imported by group and version:
 *
 *   import type { Pod } from '@overkube/kube-types/core/v1';
 *   import type { Deployment } from '@overkube/kube-types/apps/v1';
 *
 * Here: the kinds table, which type each kind's objects have, and what any
 * object is.
 */
import type { KindMap } from './gen/kinds.js';
import type { KindInfo } from './object.js';

export { type KindMap, kinds } from './gen/kinds.js';
export { apiVersion, type GroupVersionKind, type KindInfo, type KubeObject } from './object.js';

/** The type of a kind's objects: ObjectOf<typeof kinds.apps.v1.Deployment> is Deployment. */
export type ObjectOf<K extends KindInfo> = K['id'] extends keyof KindMap ? KindMap[K['id']] : never;
