import type { ObjectMeta } from './gen/meta/v1.js';

/** Any Kubernetes object: what a kind with no types of its own (a CRD) is seen as. */
export interface KubeObject<Spec = unknown, Status = unknown> {
  apiVersion?: string;
  kind?: string;
  metadata?: ObjectMeta;
  spec?: Spec;
  status?: Status;
}

/** Where a kind lives in the API: what a list or a watch of it is asked at. */
export interface GroupVersionKind {
  /** "" for the core group (Pods, Services, …). */
  group: string;
  version: string;
  kind: string;
}

/** A kind as the kinds table describes it (kinds.apps.v1.Deployment). */
export interface KindInfo extends GroupVersionKind {
  /** apiVersion and kind: "v1/Pod", "apps/v1/Deployment"; the key of KindMap. */
  id: string;
  /** In the API's URLs: /apis/apps/v1/namespaces/<ns>/deployments. */
  plural: string;
  singular: string;
  namespaced: boolean;
  verbs: readonly string[];
  shortNames?: readonly string[];
  categories?: readonly string[];
  /** Its subresources, as discovery lists them: "status", "scale", "log". */
  subresources?: readonly string[];
}

/** The apiVersion an object of this kind carries: "v1", "apps/v1". */
export function apiVersion({ group, version }: GroupVersionKind): string {
  return group ? `${group}/${version}` : version;
}
