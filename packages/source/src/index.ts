/**
 * overkube's answers to queries (@overkube/query) from the cluster's data
 * as the page watches it: each query planned onto feeds (@overkube/connector)
 * — the fewest that hold what it asks, a namespace or a name told to the
 * API server, the namespaces one may not list denied — its fields the
 * kind's (@overkube/kube-fields, a CRD's columns), answered by a scan
 * whenever it is read after its feeds changed. A Source: a server could
 * answer the same queries, and nothing that asks has to know which.
 */

export { capabilities, FieldsCache, type KindFields, refOf } from './fields.ts';
export { createSource, type FieldsResult, type PageSource, type SourceOptions } from './source.ts';
