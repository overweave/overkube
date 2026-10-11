/** The part of an OpenAPI v3 schema object Kubernetes uses (and CRDs' openAPIV3Schema). */
export interface Schema {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  additionalProperties?: Schema | boolean;
  $ref?: string;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  enum?: unknown[];
  not?: Schema;
  nullable?: boolean;
  'x-kubernetes-int-or-string'?: boolean;
  'x-kubernetes-preserve-unknown-fields'?: boolean;
  'x-kubernetes-group-version-kind'?: GroupVersionKind[];
}

export interface GroupVersionKind {
  group: string;
  version: string;
  kind: string;
}

/** One group-version's document from /openapi/v3/<path>. */
export interface OpenApiDocument {
  components?: { schemas?: Record<string, Schema> };
}

/** One resource of a group-version, as discovery (/api/v1, /apis/<group>/<version>) lists it. */
export interface ApiResource {
  name: string;
  singularName?: string;
  namespaced: boolean;
  kind: string;
  verbs: string[];
  shortNames?: string[];
  categories?: string[];
}

/** What the generator reads from a cluster: its version, and per group-version path its schemas and resources. */
export interface Snapshot {
  /** The cluster's /version gitVersion: "v1.35.7". */
  kubernetes: string;
  groupVersions: {
    /** "api/v1", "apis/apps/v1". */
    path: string;
    openapi: OpenApiDocument;
    resources: ApiResource[];
  }[];
}

/** A group the cluster serves: where it comes from decides whose types it is (built in: @overkube/kube-types; the rest: an addon's). */
export interface ApiGroup {
  /** "" for the core group. */
  name: string;
  versions: string[];
  /** Kubernetes' own; a CRD's; or an APIService's that sends it to a service of its own (metrics.k8s.io). */
  source: 'built-in' | 'crd' | 'aggregated';
}
