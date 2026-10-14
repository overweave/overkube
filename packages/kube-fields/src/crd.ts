import { compilePath, type FieldDef, type FieldName, type FieldType, type KindRef } from '@overkube/query';
import { type Defs, define } from './define.ts';

/*
 * What a CRD says of its objects, as fields: each column it prints (its
 * additionalPrinterColumns, of each version it serves), a field of that
 * version's kind — its path as the CRD has it ($ and a missing first dot
 * aside), its type as the CRD declares it (integer and number: a number;
 * boolean: a bool; date: a time) — and the column as the CRD says it (its
 * name, format, priority, description; whether its version is
 * deprecated), for whoever shows them. Left out, and why: a column whose
 * path is none of ours (.., a union), whose type is none, whose name is
 * another's of its version once made a field's (Foo Bar, Foo-Bar), or no
 * name at all, no path (the whole object); Name and Age, if they are every
 * object's (its name, its creation time: core.name, core.created).
 */

/** A CRD, as much of it as its columns need. */
export interface CrdLike {
  spec: {
    group: string;
    names: { plural: string };
    versions?: readonly {
      name: string;
      served?: boolean;
      deprecated?: boolean;
      additionalPrinterColumns?: readonly { name: string; type: string; jsonPath: string; format?: string; priority?: number; description?: string }[];
    }[];
  };
}

/** A column as its CRD says it: of which field, its name, type, format, priority (1: only wide), description; its version deprecated. */
export interface CrdColumn {
  field: FieldName;
  kind: KindRef;
  name: string;
  type: string;
  format?: string;
  priority: number;
  description?: string;
  deprecated: boolean;
}

const TYPES: Record<string, FieldType> = { integer: 'number', number: 'number', boolean: 'bool', date: 'time', string: 'string' };
const EVERY: Record<string, string> = { name: '.metadata.name', age: '.metadata.creationTimestamp' };

/** A column's name as a field's last part: Port(s) → port-s. */
export const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A served version's kind, as its ref says it (plural.version.group). */
export const crdKindRef = (crd: CrdLike, version: string): KindRef => `${crd.spec.names.plural}.${version}.${crd.spec.group}`;

/** A column's path as ours: $ aside, a first dot made sure of. */
const pathOf = (jsonPath: string) => {
  const p = jsonPath.trim().replace(/^\$/, '');
  return p.startsWith('.') ? p : `.${p}`;
};

export interface CrdFields {
  fields: Defs;
  columns: readonly CrdColumn[];
  /** Columns left out: their kind and name, why. */
  skipped: Readonly<Record<string, string>>;
}

/** The fields of a CRD's columns, of every version it serves; the columns as it says them. */
export function crdFields(crd: CrdLike): CrdFields {
  const fields: Record<FieldName, Omit<FieldDef, 'version'>> = {};
  const columns: CrdColumn[] = [];
  const skipped: Record<string, string> = {};
  for (const v of crd.spec.versions ?? []) {
    if (!v.served) continue;
    const kind = crdKindRef(crd, v.name);
    const named = new Map<string, string>();
    for (const column of v.additionalPrinterColumns ?? []) {
      const at = `${kind} ${column.name}`;
      const part = slug(column.name);
      const path = pathOf(column.jsonPath);
      if (!part) {
        skipped[at] = 'no name to make a field of';
        continue;
      }
      if (path === '.') {
        skipped[at] = 'no path (the whole object)';
        continue;
      }
      if (EVERY[part] === path) {
        skipped[at] = `every object's already (core.${part === 'name' ? 'name' : 'created'})`;
        continue;
      }
      const other = named.get(part);
      if (other !== undefined) {
        skipped[at] = `its field is ${other}'s (${kind}.${part})`;
        continue;
      }
      const type = TYPES[column.type];
      if (!type) {
        skipped[at] = `no type ${column.type}`;
        continue;
      }
      try {
        compilePath(path);
      } catch (e) {
        skipped[at] = (e as Error).message;
        continue;
      }
      const name = `${kind}.${part}`;
      named.set(part, column.name);
      fields[name] = { kinds: [kind], type, value: path as `.${string}` };
      columns.push({
        field: name,
        kind,
        name: column.name,
        type: column.type,
        ...(column.format ? { format: column.format } : {}),
        priority: column.priority ?? 0,
        ...(column.description ? { description: column.description } : {}),
        deprecated: v.deprecated === true,
      });
    }
  }
  return { fields: define(fields), columns, skipped };
}
