import { canonical, fnv1a64 } from './hash.ts';
import type { FieldDef, FieldName, FieldSpec, QueryError } from './model.ts';
import { compilePath } from './path.ts';
import type { Fields } from './scan.ts';

/** The most a field definition may say: kinds, a path's length, CEL's. */
export const FIELD_LIMITS = { kinds: 64, text: 1024, cel: 16_384 } as const;

/**
 * A field definition's version: what its values are — its type, many,
 * value — hashed (64 bits); its kinds and unit aside (they do not change a
 * value), its salt in (what else its values are of: the CEL engine's
 * semantics, the functions it calls). CEL as it is given: the caller gives
 * its fingerprint (its tree, not its spaces) to hash.
 */
export function fieldVersion(def: Pick<FieldDef, 'type' | 'many' | 'value'>, salt?: string): string {
  return fnv1a64(canonical({ type: def.type, many: def.many === true, value: def.value, salt }));
}

/** A field definition, its version made. */
export function defineField(def: Omit<FieldDef, 'version'>, salt?: string): FieldDef {
  return { ...def, version: fieldVersion(def, salt) };
}

const TYPES = new Set(['string', 'number', 'time', 'bool']);

/** A value as a message may say it (whatever it is: a bigint, a cycle — none thrown). */
const show = (v: unknown) => {
  try {
    return typeof v === 'bigint' ? `${v}n` : (JSON.stringify(v) ?? String(v)).slice(0, 64);
  } catch {
    return String(v).slice(0, 64);
  }
};
const UNITS = new Set(['cores', 'bytes']);

/** Why something given as a field definition is none (taken as unknown: from anyone) — or nothing. */
export function checkFieldDef(def: unknown): QueryError | undefined {
  const bad = (message: string): QueryError => ({ code: 'bad_field', message });
  if (typeof def !== 'object' || def === null || Array.isArray(def)) return bad('a field is { type, value, kinds?, many?, unit?, version? }');
  const d = def as Record<string, unknown>;
  const extra = Object.keys(d).find((k) => !['kinds', 'type', 'many', 'unit', 'value', 'version'].includes(k));
  if (extra !== undefined) return bad(`a field has no ${extra}`);
  if (typeof d.type !== 'string' || !TYPES.has(d.type)) return bad(`no type ${show(d.type)}`);
  if (d.many !== undefined && typeof d.many !== 'boolean') return bad('many is true or false');
  if (d.unit !== undefined && !(typeof d.unit === 'string' && UNITS.has(d.unit))) return bad(`no unit ${show(d.unit)}`);
  if (d.version !== undefined && typeof d.version !== 'string') return bad('a version is a string');
  if (
    d.kinds !== undefined &&
    !(Array.isArray(d.kinds) && d.kinds.length <= FIELD_LIMITS.kinds && d.kinds.every((k) => typeof k === 'string' && k.length > 0 && k.length <= FIELD_LIMITS.text))
  )
    return bad(`kinds are at most ${FIELD_LIMITS.kinds} kinds' refs`);
  const v = d.value;
  if (typeof v === 'string') return v.startsWith('.') && v.length <= FIELD_LIMITS.text ? undefined : bad(`a path starts with . and is at most ${FIELD_LIMITS.text} long`);
  if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 1 && typeof (v as { cel?: unknown }).cel === 'string')
    return (v as { cel: string }).cel.length <= FIELD_LIMITS.cel ? undefined : bad(`CEL is at most ${FIELD_LIMITS.cel} long`);
  return bad('a value is a path or { cel }');
}

/** How CEL is made into what it says of an object (none given: no field of CEL is had). */
export type CompileCel = (expression: string) => (object: unknown) => unknown;

/**
 * Field definitions as a scan has them: each checked (anything may be
 * given); a path as it is (made, to be sure it is one); CEL made by
 * compile. One that cannot be (not a definition, a path or CEL that is
 * none, CEL and nothing to make it): left out, and why. Versions as given:
 * a catalog's, prepared (@overkube/cel prepareCatalog: worked out anew),
 * not anyone's raw definitions.
 */
export function fieldsOf(defs: unknown, compile?: CompileCel): { fields: Fields; rejected: Readonly<Record<FieldName, string>> } {
  const fields = new Map<FieldName, FieldSpec<never>>();
  const rejected = new Map<FieldName, string>();
  const out = () => ({ fields, rejected: Object.fromEntries(rejected) });
  if (typeof defs !== 'object' || defs === null || Array.isArray(defs)) {
    rejected.set('', 'fields are { name: definition }');
    return out();
  }
  for (const [name, def] of Object.entries(defs)) {
    const wrong = checkFieldDef(def);
    if (wrong) {
      rejected.set(name, wrong.message);
      continue;
    }
    const { kinds, type, many, version, value: given } = def as FieldDef;
    try {
      let value: FieldSpec<never>['value'];
      if (typeof given === 'string') {
        compilePath(given);
        value = given;
      } else if (!compile) throw new Error('no CEL here');
      else value = compile(given.cel) as FieldSpec<never>['value'];
      fields.set(name, Object.freeze({ kinds: kinds && Object.freeze([...kinds]), type, many, version, value }));
    } catch (e) {
      rejected.set(name, (e as Error).message);
    }
  }
  return out();
}
