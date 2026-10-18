import { canonical, checkFieldDef, compilePath, type FieldCatalog, type FieldDef, type FieldName, fieldVersion, isJoin, isPath } from '@overkube/query';
import { type Cel, CelError, type CelOptions, createCel, SEMANTICS } from './cel.ts';

/*
 * A catalog of fields made ready to answer by — the same wherever it is
 * made (the page, a server given it): checked (anything may be given,
 * nothing thrown: what cannot be, rejected, and why — the catalog as a
 * whole under ""), its functions of CEL made (calling one another, never
 * round), each field's version worked out anew, not taken as given — of
 * what its values are: its type, many; its path, its join, or its CEL's fingerprint
 * (its tree, not its spaces) and the versions of the functions it calls
 * (and those they call); the engine's semantics. Fields trusted (ours: the
 * core's) made as they are; the rest held to the bound. What is made: a
 * copy, frozen (what was given left as it was); any name a name
 * (__proto__ too).
 */

/** What a path means: query's JSONPath, as it is now (another meaning, another version). */
export const PATH_SEMANTICS = 'jsonpath@1';
/** What a join means: the other kind's object of the same namespace and name, its field's values; keyed (by, to): those whose to is its by, reduced. */
export const JOIN_SEMANTICS = 'join@1';

/**
 * A field definition, its version worked out by this CEL (its kinds and
 * unit kept, not hashed); a join's, of the version of the field it reads
 * (versions: those known — of another kind's own fields, its name alone).
 */
export function versionOf(def: Omit<FieldDef, 'version'>, cel: Cel, versions: ReadonlyMap<FieldName, string> = new Map()): FieldDef {
  if (typeof def.value === 'string') return { ...def, version: fieldVersion(def, PATH_SEMANTICS) };
  if (isJoin(def.value)) {
    // Of the versions of the fields it reads: theirs, and (keyed) its own it is joined by, theirs it is joined to.
    const versionOfField = (name: FieldName | undefined) => (name === undefined ? null : isPath(name) ? PATH_SEMANTICS : (versions.get(name) ?? null));
    const { field, by, to } = def.value;
    return { ...def, version: fieldVersion(def, canonical([JOIN_SEMANTICS, versionOfField(field), versionOfField(by), versionOfField(to)])) };
  }
  const seen = cel.inspect(def.value.cel);
  const salt = canonical([SEMANTICS, seen.functions.map((f) => [f, cel.functionVersion(f)])]);
  return { ...def, version: fieldVersion({ ...def, value: { cel: seen.fingerprint } }, salt) };
}

export interface Prepared {
  catalog: FieldCatalog;
  cel: Cel;
  /** Fields left out: why ("": the catalog itself, or its functions). */
  rejected: Readonly<Record<FieldName, string>>;
}

export interface PrepareOptions extends Omit<CelOptions, 'functions'> {
  /** Fields made as they are (ours: the core's), not held to the bound. */
  trusted?: Iterable<FieldName>;
}

const freeze = <T>(v: T): T => {
  if (typeof v === 'object' && v !== null) {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A catalog, from anyone, made ready: its functions, its fields checked and versioned anew — nothing thrown. */
export function prepareCatalog(input: unknown, options: PrepareOptions = {}): Prepared {
  const rejected = new Map<FieldName, string>();
  const { trusted, ...celOptions } = options;
  const trust = new Set(trusted ?? []);
  let fields: Record<string, unknown> = {};
  let functions: Record<string, string> = {};
  if (!isRecord(input) || !isRecord(input.fields)) rejected.set('', 'a catalog is { fields: { name: definition }, functions? }');
  else {
    fields = input.fields;
    const fns = input.functions ?? {};
    if (isRecord(fns) && Object.values(fns).every((f) => typeof f === 'string')) functions = fns as Record<string, string>;
    else rejected.set('', 'functions are { name: CEL }');
  }
  let cel: Cel;
  try {
    cel = createCel({ ...celOptions, functions });
  } catch (e) {
    rejected.set('', (e as Error).message);
    functions = {};
    cel = createCel(celOptions);
  }
  const ready: [FieldName, FieldDef][] = [];
  // Joins last: each of the version of the field it reads, where that is one of these.
  const joined = (def: unknown) => Number(isJoin((def as FieldDef | null)?.value));
  const versions = new Map<FieldName, string>();
  for (const [name, def] of Object.entries(fields).sort(([, a], [, b]) => joined(a) - joined(b))) {
    const wrong = checkFieldDef(def);
    if (wrong) {
      rejected.set(name, wrong.message);
      continue;
    }
    const { kinds, type, many, unit, value } = def as FieldDef;
    try {
      if (typeof value === 'string') compilePath(value);
      else if (!isJoin(value)) cel.compile(value.cel, { trusted: trust.has(name) });
      const copy = {
        ...(kinds ? { kinds: [...kinds] } : {}),
        type,
        ...(many ? { many } : {}),
        ...(unit ? { unit } : {}),
        value:
          typeof value === 'string'
            ? value
            : isJoin(value)
              ? { from: value.from, field: value.field, ...(value.by ? { by: value.by, to: value.to, reduce: value.reduce } : {}) }
              : { cel: value.cel },
      };
      const made = versionOf(copy, cel, versions);
      versions.set(name, made.version);
      ready.push([name, made]);
    } catch (e) {
      rejected.set(name, e instanceof CelError || e instanceof Error ? e.message : String(e));
    }
  }
  const catalog: FieldCatalog = { fields: Object.fromEntries(ready), functions: { ...functions }, semantics: cel.semantics };
  return { catalog: freeze(catalog), cel, rejected: freeze(Object.fromEntries(rejected)) };
}

/** Fields and functions as anyone gives them (checked, versioned when prepared). */
export interface Layer {
  fields?: Readonly<Record<FieldName, unknown>>;
  functions?: Readonly<Record<string, string>>;
}

/** Catalogs laid one over another: a later one's field or function of a name in place of an earlier one's (any name: __proto__ too; versions worked out anew when prepared). */
export function layer(...catalogs: readonly Layer[]): Required<Layer> {
  const merge = <T>(of: (c: Layer) => Readonly<Record<string, T>> | undefined) => Object.fromEntries(catalogs.flatMap((c) => Object.entries(of(c) ?? {})));
  return { fields: merge((c) => c.fields), functions: merge((c) => c.functions) };
}
