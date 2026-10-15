/*
 * @overkube/kube-fields: the fields Kubernetes objects are asked by before
 * anyone adds to them — as data (paths, CEL), so the page and a server
 * answer by them alike. Every object's (COMMON); the built-in kinds' own
 * (pods, nodes, workload controllers); a CRD's columns (crdFields);
 * together, for a kind (baseFields); the CEL functions they call (LIBRARY:
 * podSummary). CEL runs where queries do (@overkube/cel).
 */

export { type Base, BUILT_IN, BUILT_INS, baseFields } from './base.ts';
export { BATCH } from './batch.ts';
export { COMMON } from './common.ts';
export { CONFIG } from './config.ts';
export { type CrdColumn, type CrdFields, type CrdLike, crdFields, crdKindRef, slug } from './crd.ts';
export { type Defs, define, KUBE_CEL } from './define.ts';
export { EVENTS } from './events.ts';
export { LIBRARY } from './library.ts';
export { NODES } from './nodes.ts';
export { PODS } from './pods.ts';
export { PRINTERS } from './printers.ts';
export { HEALTH, STATUS } from './status.ts';
export { WORKLOADS } from './workloads.ts';
