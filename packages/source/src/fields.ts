import { prepareCatalog } from '@overkube/cel';
import { BUILT_IN, baseFields, COMMON, type CrdLike } from '@overkube/kube-fields';
import type { KindInfo } from '@overkube/kube-types';
import { type Capabilities, type FieldCatalog, type FieldName, type Fields, fieldsOf, type KindRef } from '@overkube/query';

/*
 * The fields a kind's objects are asked by: every object's, the built-in
 * kind's own, a CRD's columns (its CRD as it is now) — prepared (checked,
 * versioned, CEL made) once for each kind, and again for each version of
 * its CRD.
 */

/** A kind's ref, as fields name it: pods.v1, deployments.v1.apps. */
export const refOf = (kind: Pick<KindInfo, 'group' | 'version' | 'plural'>): KindRef => `${kind.plural}.${kind.version}${kind.group ? `.${kind.group}` : ''}`;

/** A kind's fields made: what a scan takes, their definitions, and what was left out (why). */
export interface KindFields {
  fields: Fields;
  catalog: FieldCatalog;
  rejected: Readonly<Record<FieldName, string>>;
}

/** A catalog made into what a scan takes: base fields are ours (trusted), checked and versioned all the same. */
function make(base: ReturnType<typeof baseFields>): KindFields {
  const { catalog, cel, rejected } = prepareCatalog(base, { trusted: Object.keys(base.fields) });
  const made = fieldsOf(catalog.fields, (expression) => cel.compile(expression, { trusted: true }));
  return { fields: made.fields, catalog, rejected: { ...rejected, ...made.rejected } };
}

export class FieldsCache {
  private readonly made = new Map<KindRef, { of: string; fields: KindFields }>();

  /** A kind's fields; a CRD's kind, of its CRD as given (made again only when its spec changed: its generation). */
  of(kind: KindInfo, crd?: CrdLike): KindFields {
    const ref = refOf(kind);
    const meta = (crd as { metadata?: { uid?: string; generation?: number; resourceVersion?: string } } | undefined)?.metadata;
    const of = crd ? `${meta?.uid}:${meta?.generation ?? meta?.resourceVersion}` : '';
    const had = this.made.get(ref);
    if (had && had.of === of) return had.fields;
    const fields = make(baseFields(ref, crd));
    this.made.set(ref, { of, fields });
    return fields;
  }
}

/** What the page answers by itself: every field it has (the core's, by version), paths, every test. */
export function capabilities(): Capabilities {
  const { catalog } = prepareCatalog({ fields: { ...COMMON, ...BUILT_IN }, functions: baseFields('').functions }, { trusted: [...Object.keys(COMMON), ...Object.keys(BUILT_IN)] });
  return {
    fields: Object.fromEntries(Object.entries(catalog.fields).map(([name, def]) => [name, def.version])),
    paths: true,
    ops: ['eq', 'ne', 'in', 'range', 'exists', 'contains', 'and', 'or', 'not'],
  };
}
