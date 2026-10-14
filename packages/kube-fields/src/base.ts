import type { FieldCatalog, KindRef } from '@overkube/query';
import { COMMON } from './common.ts';
import { type CrdColumn, type CrdLike, crdFields } from './crd.ts';
import type { Defs } from './define.ts';
import { LIBRARY } from './library.ts';
import { NODES } from './nodes.ts';
import { PODS } from './pods.ts';
import { WORKLOADS } from './workloads.ts';

/** The built-in kinds' own fields, a set of them each (a new kind: one more here). */
export const BUILT_INS: readonly Defs[] = [PODS, NODES, WORKLOADS];

/** Every built-in kind's own fields. */
export const BUILT_IN: Defs = Object.assign({}, ...BUILT_INS);

export interface Base extends Pick<FieldCatalog, 'fields' | 'functions'> {
  /** A CRD's columns as it says them. */
  columns: readonly CrdColumn[];
  /** A CRD's columns left out, and why. */
  skipped: Readonly<Record<string, string>>;
}

/**
 * What a kind's objects are asked by before anyone adds to it: every
 * object's fields, the kind's own (built-in), its CRD's columns (if it is
 * one); the functions of CEL they call — a catalog to lay others over and
 * prepare (@overkube/cel: prepareCatalog, layer).
 */
export function baseFields(kind: KindRef, crd?: CrdLike): Base {
  const of = crd ? crdFields(crd) : { fields: {}, columns: [], skipped: {} };
  const own = Object.entries({ ...BUILT_IN, ...of.fields }).filter(([, def]) => def.kinds?.includes(kind));
  return {
    fields: { ...COMMON, ...Object.fromEntries(own) },
    functions: LIBRARY,
    columns: of.columns.filter((c) => c.kind === kind),
    skipped: of.skipped,
  };
}
