import { createCel, versionOf } from '@overkube/cel';
import type { FieldDef, FieldName } from '@overkube/query';
import { LIBRARY } from './library.ts';

/** Fields as defined, by name. */
export type Defs = Readonly<Record<FieldName, FieldDef>>;

/** CEL with the library: what kube-fields' fields are versioned by (the CEL engine's semantics, the functions they call). */
export const KUBE_CEL = createCel({ functions: LIBRARY });

/** Fields, each its version made (of what its values are: its type, many, its path or its CEL's tree and the functions it calls). */
export function define(defs: Record<FieldName, Omit<FieldDef, 'version'>>): Defs {
  return Object.fromEntries(Object.entries(defs).map(([name, def]) => [name, versionOf(def, KUBE_CEL)]));
}
