import { type Cel, type Layer, layer, prepareCatalog } from '@overkube/cel';
import { BUILT_IN, baseFields, COMMON, type CrdColumn, type CrdLike } from '@overkube/kube-fields';
import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { type Capabilities, type FieldCatalog, type FieldName, type Fields, fieldsOf, isJoin, isPath, type Join, type KindRef, keyOf, kindRef, valuesOf } from '@overkube/query';

/*
 * The fields a kind's objects are asked by: every object's, the built-in
 * kind's own, a CRD's columns (its CRD as it is now), and over them those
 * addons add (layers: theirs held to the CEL bound, ours not) — prepared
 * (checked, versioned, CEL made) once for each kind, and again when its
 * CRD's spec or the layers change. With them, a CRD's columns as it says
 * them (for whoever shows the kind). A joined field (another kind's
 * object's) is none till bound (bindJoins) to where that kind's objects are.
 */

/** A kind's fields made: what a scan takes, their definitions, what was left out (why); a CRD's columns, and those of them left out (why). */
export interface KindFields {
  /** The kind's ref (pods.v1): its fields' short names, a filter's. */
  ref: KindRef;
  fields: Fields;
  /** The CEL its fields are made with (their functions): a filter's too. */
  cel: Cel;
  catalog: FieldCatalog;
  rejected: Readonly<Record<FieldName, string>>;
  columns: readonly CrdColumn[];
  skipped: Readonly<Record<string, string>>;
  /** Its joined fields, by name: of which kind's objects, which field. */
  joined: ReadonlyMap<FieldName, Join>;
}

/** Ours, and the addons' over them, made into what a scan takes: ours trusted (but those an addon put another in place of), checked and versioned all. */
function make(ref: KindRef, crd: CrdLike | undefined, layers: readonly Layer[]): KindFields {
  const base = baseFields(ref, crd);
  const theirs = new Set(layers.flatMap((l) => Object.keys(l.fields ?? {})));
  const { catalog, cel, rejected } = prepareCatalog(layer(base, ...layers), { trusted: Object.keys(base.fields).filter((name) => !theirs.has(name)) });
  const joined = new Map<FieldName, Join>();
  const made = fieldsOf(
    catalog.fields,
    (expression) => cel.compile(expression, { trusted: true }),
    // None till bound to the other kind's objects.
    () => () => undefined,
  );
  for (const [name, def] of Object.entries(catalog.fields)) if (isJoin(def.value) && made.fields.has(name)) joined.set(name, def.value);
  return { ref, fields: made.fields, cel, catalog, rejected: { ...rejected, ...made.rejected }, columns: base.columns, skipped: base.skipped, joined };
}

/**
 * Another kind's objects as a join reads them, now (each time it is read):
 * by key (namespace/name), that kind's fields; none (not served, not had):
 * its joined values none.
 */
export type Joining = (from: KindRef) => { find(key: string): KubeObject | undefined; fields(): KindFields } | undefined;

/** The most bindings kept of a kind's fields (the plans reading it, each its way to the other kinds). */
const BOUND = 8;
const bound = new WeakMap<KindFields, Map<string, KindFields>>();

/**
 * A kind's fields, its joined ones read of the other kinds' objects as
 * joining has them (by key: the same key, the same fields — what reads
 * them keeps what it worked out of the rest). A joined value is worked out
 * each time it is read (volatile), so it follows those objects as they
 * change. One joining a field the other kind has not, or a joined one of
 * its own: told as its error. None joined: as they are.
 */
export function bindJoins(made: KindFields, joining: Joining, key: string): KindFields {
  if (!made.joined.size) return made;
  let mine = bound.get(made);
  if (!mine) {
    mine = new Map();
    bound.set(made, mine);
  }
  const had = mine.get(key);
  if (had) return had;
  const fields = new Map(made.fields);
  for (const [name, { from, field }] of made.joined) {
    const spec = made.fields.get(name);
    if (!spec) continue;
    const value = (object: unknown) => {
      const other = joining(from);
      if (!other) return undefined;
      const theirs = other.fields();
      if (theirs.joined.has(field)) throw Object.assign(new Error(`${from}'s ${field} is joined itself: a join reads no joined field`), { code: 'bad_join' });
      if (!theirs.fields.has(field) && !isPath(field)) throw Object.assign(new Error(`${from} has no field ${field}`), { code: 'bad_join' });
      const it = other.find(keyOf(object));
      return it ? valuesOf(it, field, theirs.fields) : undefined;
    };
    fields.set(name, Object.freeze({ ...spec, value: value as never }));
  }
  const out = { ...made, fields };
  // A few kept: the oldest let go.
  if (mine.size >= BOUND) mine.delete(mine.keys().next().value as string);
  mine.set(key, out);
  return out;
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
