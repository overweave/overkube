/**
 * Kubernetes object types. The kinds' types are generated from a cluster's
 * OpenAPI schemas (make kube-types) and imported by group and version:
 *
 *   import type { Pod } from '@overkube/kube-types/core/v1';
 *   import type { Deployment } from '@overkube/kube-types/apps/v1';
 *
 * A group-version the API server prints kinds of (core/v1, apps/v1,
 * batch/v1, networking/v1, storage/v1, … — every built-in one) gives, with
 * its types, how kubectl shows each — its columns, by hand from the API
 * server's printers, beside the generated types:
 *
 *   import { type Ingress, ingressColumns } from '@overkube/kube-types/networking/v1';
 *
 * Here: the kinds table, which type each kind's objects have, what any
 * object is, and what a printer column is.
 */
import { type KindMap, kinds } from './gen/kinds.js';
import type { KindInfo } from './object.js';

export { type KindMap, kinds } from './gen/kinds.js';

/** Every kind the kinds table knows: what a kind is before a cluster's discovery says (and in a cluster in memory). */
export const knownKinds: readonly KindInfo[] = Object.freeze(
  Object.values(kinds).flatMap((versions) => Object.values(versions).flatMap((byKind) => Object.values(byKind as Record<string, KindInfo>))),
);
export { ageColumn, humanDuration, nameColumn, type PrintContext, type PrinterColumn } from './columns/print.js';
export { apiVersion, type GroupVersionKind, type KindInfo, type KubeObject } from './object.js';

/** The type of a kind's objects: ObjectOf<typeof kinds.apps.v1.Deployment> is Deployment. */
export type ObjectOf<K extends KindInfo> = K['id'] extends keyof KindMap ? KindMap[K['id']] : never;
