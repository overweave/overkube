import { type Layer, layer, prepareCatalog } from '@overkube/cel';
import { BUILT_IN, baseFields, COMMON, type CrdColumn, type CrdLike } from '@overkube/kube-fields';
import type { KindInfo } from '@overkube/kube-types';
import { type Capabilities, type FieldCatalog, type FieldName, type Fields, fieldsOf, type KindRef, kindRef } from '@overkube/query';

/*
 * The fields a kind's objects are asked by: every object's, the built-in
 * kind's own, a CRD's columns (its CRD as it is now), and over them those
 * addons add (layers: theirs held to the CEL bound, ours not) — prepared
 * (checked, versioned, CEL made) once for each kind, and again when its
 * CRD's spec or the layers change. With them, a CRD's columns as it says
 * them (for whoever shows the kind).
 */

/** A kind's fields made: what a scan takes, their definitions, what was left out (why); a CRD's columns, and those of them left out (why). */
export interface KindFields {
  fields: Fields;
  catalog: FieldCatalog;
  rejected: Readonly<Record<FieldName, string>>;
  columns: readonly CrdColumn[];
  skipped: Readonly<Record<string, string>>;
}

/** Ours, and the addons' over them, made into what a scan takes: ours trusted (but those an addon put another in place of), checked and versioned all. */
function make(ref: KindRef, crd: CrdLike | undefined, layers: readonly Layer[]): KindFields {
  const base = baseFields(ref, crd);
  const theirs = new Set(layers.flatMap((l) => Object.keys(l.fields ?? {})));
  const { catalog, cel, rejected } = prepareCatalog(layer(base, ...layers), { trusted: Object.keys(base.fields).filter((name) => !theirs.has(name)) });
  const made = fieldsOf(catalog.fields, (expression) => cel.compile(expression, { trusted: true }));
  return { fields: made.fields, catalog, rejected: { ...rejected, ...made.rejected }, columns: base.columns, skipped: base.skipped };
}

export class FieldsCache {
  private readonly made = new Map<KindRef, { crd: string; layers: readonly Layer[]; fields: KindFields }>();

  /** A kind's fields: a CRD's kind of its CRD as given (made again only when its spec changed: its generation), the layers as given (the same array: the same). */
  of(kind: KindInfo, crd: CrdLike | undefined, layers: readonly Layer[]): KindFields {
    const ref = kindRef(kind);
    const meta = (crd as { metadata?: { uid?: string; generation?: number; resourceVersion?: string } } | undefined)?.metadata;
    const key = crd ? `${meta?.uid}:${meta?.generation ?? meta?.resourceVersion}` : '';
    const had = this.made.get(ref);
    if (had && had.crd === key && had.layers === layers) return had.fields;
    const fields = make(ref, crd, layers);
    this.made.set(ref, { crd: key, layers, fields });
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
