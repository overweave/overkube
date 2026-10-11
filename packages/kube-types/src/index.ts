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
import { type KindMap, kinds } from './gen/kinds.js';
import type { KindInfo } from './object.js';

export { type KindMap, kinds } from './gen/kinds.js';

/** Every kind the kinds table knows: what a kind is before a cluster's discovery says (and in a cluster in memory). */
export const knownKinds: readonly KindInfo[] = Object.freeze(
  Object.values(kinds).flatMap((versions) => Object.values(versions).flatMap((byKind) => Object.values(byKind as Record<string, KindInfo>))),
);
export { apiVersion, type GroupVersionKind, type KindInfo, type KubeObject } from './object.js';

/** The type of a kind's objects: ObjectOf<typeof kinds.apps.v1.Deployment> is Deployment. */
export type ObjectOf<K extends KindInfo> = K['id'] extends keyof KindMap ? KindMap[K['id']] : never;
