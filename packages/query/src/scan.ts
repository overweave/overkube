import { canonical, fnv1a64 } from './hash.ts';
import type { CountQuery, CountResult, Cursor, FieldError, FieldName, FieldSpec, FieldType, Group, Item, ListQuery, ListResult, QueryError, Sort, Value, Where } from './model.ts';
import { compilePath, isPath, PathError, PathEvalError } from './path.ts';
import { byCodePoint, wellFormed } from './text.ts';

/*
 * A query answered by going through every object (a scan: what an index
 * answers at once): the page answers so from what it watches, a server
 * where it has no index for a field. Of the objects given (of its kind and
 * scope, allowed: the caller's to give): a field's values, worked out once
 * for each object (a new version, a new object); which hold to the where;
 * in order, by the model's rules; the window of them, how many in all,
 * where the next starts; counted, by a field's values. A query that asks
 * what cannot be (no such field, a value not of its type, not a query at
 * all): checkQuery says why — scan and scanCount take it as checked.
 */

/** The fields known, by name (a function's object: whatever its kinds' are). */
export type Fields = ReadonlyMap<FieldName, FieldSpec<never>>;

/** An object's key (namespace/name), and its uid. */
export const keyOf = (object: unknown): string => {
  const meta = (object as { metadata?: { namespace?: string; name?: string } } | null)?.metadata;
  return meta?.namespace ? `${meta.namespace}/${meta.name ?? ''}` : (meta?.name ?? '');
};
const uidOf = (object: unknown): string | undefined => (object as { metadata?: { uid?: string } } | null)?.metadata?.uid;

const DECIMAL = /^-?\d+(\.\d+)?$/;
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/** A time in RFC 3339 (Go's time.RFC3339: T, Z, a zone to 23:59), as ms — finer than ms cut off (no such day, hour or zone: none). */
function rfc3339(text: string): number | undefined {
  const m = RFC3339.exec(text);
  if (!m) return undefined;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return undefined;
  const at = new Date(0);
  at.setUTCFullYear(y, mo - 1, d);
  at.setUTCHours(h, mi, s, m[7] ? Number(m[7].slice(0, 3).padEnd(3, '0')) : 0);
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return undefined;
  if (m[8] === undefined) return at.getTime();
  const [zh, zm] = [Number(m[9]), Number(m[10])];
  return zh > 23 || zm > 59 ? undefined : at.getTime() - (m[8] === '-' ? -1 : 1) * (zh * 60 + zm) * 60_000;
}

/** A value as its field's type has it, by the model's rules (not one: none); a path's, as it is (a number that is none: none). */
function typed(v: unknown, type: FieldType | undefined): Value | undefined {
  switch (type) {
    case 'time':
      return typeof v === 'number' ? (Number.isFinite(v) ? v : undefined) : typeof v === 'string' ? rfc3339(v) : undefined;
    case 'number': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && DECIMAL.test(v) ? Number(v) : Number.NaN;
      return Number.isFinite(n) ? n : undefined;
    }
    case 'bool':
      return typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : undefined;
    case 'string':
      return typeof v === 'string' ? wellFormed(v) : typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'boolean' ? String(v) : undefined;
    default:
      return typeof v === 'string' ? wellFormed(v) : typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) ? v : undefined;
  }
}

/** A field as it is known: declared (a name that looks like a path too), else a path (its type: its values'; all it reaches). */
type Known = Omit<FieldSpec<never>, 'type'> & { type?: FieldType };

function resolve(fields: Fields, name: FieldName): Known | undefined {
  return fields.get(name) ?? (isPath(name) ? { many: true, value: name } : undefined);
}

/** How a field is read of an object: its function, or its path made once. */
const readerOf = (spec: Known): ((object: unknown) => unknown) => (typeof spec.value === 'function' ? (spec.value as (object: unknown) => unknown) : compilePath(spec.value));

/** A field's values of an object, as kept: one value; a many field's, frozen; none: NONE. */
type Cell = Value | readonly Value[];
const NONE: readonly Value[] = Object.freeze([]);

/**
 * A field's values worked out of an object: a path that cannot be, none
 * (kubectl's: as the apiserver's tables have it); anything else that
 * throws, none — and told (fail).
 */
function workOut(spec: Known, read: (object: unknown) => unknown, object: unknown, fail?: (e: unknown) => void): Cell {
  let raw: unknown;
  try {
    raw = read(object);
  } catch (e) {
    if (e instanceof PathError) throw e;
    if (!(e instanceof PathEvalError)) fail?.(e);
    return NONE;
  }
  if (!spec.many) {
    for (const v of Array.isArray(raw) ? raw : [raw]) {
      const t = typed(v, spec.type);
      if (t !== undefined) return t;
    }
    return NONE;
  }
  const all: Value[] = [];
  for (const v of Array.isArray(raw) ? raw : [raw]) {
    const t = typed(v, spec.type);
    if (t !== undefined) all.push(t);
  }
  return all.length ? Object.freeze(all) : NONE;
}

/**
 * What is kept of the fields known (one map of them: another — or this one
 * changed — kept apart, the old let go): each declared field a slot, its
 * values in it for each object once worked out (and their natural keys,
 * sorted by), then the object's key and its natural key. A path not declared
 * is worked out each time (what anyone types into a search kept by none).
 */
interface Catalog {
  fields: Fields;
  names: FieldName[];
  slots: Map<FieldName, number>;
  specs: Known[];
  rows: WeakMap<object, unknown[]>;
  /** Of each object, the fields that could not be worked out of it, and why (kept as its values are: once for it). */
  failed: WeakMap<object, Map<FieldName, Omit<FieldError, 'count'>>>;
  /** Whether any field could not be worked out of any object (none: nothing to look for). */
  anyFailed: boolean;
}

const catalogs = new WeakMap<Fields, Catalog>();

function catalogOf(fields: Fields): Catalog {
  const had = catalogs.get(fields);
  if (had && had.names.length === fields.size && had.names.every((n, i) => fields.get(n) === had.specs[i])) return had;
  const names = [...fields.keys()];
  const catalog = {
    fields,
    names,
    slots: new Map(names.map((n, i) => [n, i])),
    specs: names.map((n) => fields.get(n) as Known),
    rows: new WeakMap(),
    failed: new WeakMap(),
    anyFailed: false,
  };
  catalogs.set(fields, catalog);
  return catalog;
}

/** What is kept of an object: its slots (made when first asked). */
function rowOf(catalog: Catalog, object: object): unknown[] {
  let row = catalog.rows.get(object);
  if (!row) {
    row = new Array(catalog.specs.length * 2 + 2);
    catalog.rows.set(object, row);
  }
  return row;
}

/** How a field's values are had of an object: kept (declared), or worked out each time (a path) — its reader made once. */
function accessor(catalog: Catalog, name: FieldName): ((object: unknown) => Cell) | undefined {
  const slot = catalog.slots.get(name);
  if (slot === undefined) {
    if (!isPath(name)) return undefined;
    const spec: Known = { many: true, value: name };
    const read = readerOf(spec);
    return (object) => (typeof object === 'object' && object !== null ? workOut(spec, read, object) : NONE);
  }
  const spec = catalog.specs[slot];
  const read = readerOf(spec);
  const fail = (object: object) => (e: unknown) => {
    const err = e as { code?: unknown; message?: unknown };
    let of = catalog.failed.get(object);
    if (!of) {
      of = new Map();
      catalog.failed.set(object, of);
    }
    of.set(name, { code: typeof err.code === 'string' ? err.code : 'error', message: String(err.message ?? e).split('\n')[0] });
    catalog.anyFailed = true;
  };
  return (object) => {
    if (typeof object !== 'object' || object === null) return NONE;
    const row = rowOf(catalog, object);
    let cell = row[slot] as Cell | undefined;
    if (cell === undefined) {
      cell = workOut(spec, read, object, fail(object));
      row[slot] = cell;
    }
    return cell;
  };
}

const isMany = (cell: Cell): cell is readonly Value[] => Array.isArray(cell);

/** Whether one of a cell's values holds (none: not). */
function some(cell: Cell, holds: (v: Value) => boolean): boolean {
  if (!isMany(cell)) return holds(cell);
  for (const v of cell) if (holds(v)) return true;
  return false;
}

/** A field's values of an object (one, unless it is many): kept once worked out (a declared field's), not to be changed. For one now and then: each call finds its field anew (scan finds it once). */
export function valuesOf(object: unknown, name: FieldName, fields: Fields): readonly Value[] {
  const cell = accessor(catalogOf(fields), name)?.(object) ?? NONE;
  return isMany(cell) ? cell : [cell];
}

const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/**
 * A string's natural key: ASCII case aside, a run of digits as its number
 * (its leading zeros aside: x-01 as x-1) — before any character but U+0000,
 * the shorter number first (x-2 before x-10), however long: its length's
 * length, its length, its digits.
 */
function natural(s: string): string {
  // A U+0001 of its own told from the mark of a number (after it: the mark's next is a digit, below U+007F).
  return asciiLower(s)
    .replaceAll('\u0001', '\u0001\u007f')
    .replace(/\d+/g, (d) => {
      const n = d.replace(/^0+(?=\d)/, '');
      const length = String(n.length);
      return `\u0001${String.fromCharCode(0x30 + length.length)}${length}${n}`;
    });
}

const RANK = { boolean: 0, number: 1, string: 2 } as const;

/** Two values in the model's order: kinds apart (bool, number, string); strings by their natural key, then by code point. */
export function compare(a: Value, b: Value): number {
  if (typeof a !== typeof b) return RANK[typeof a as keyof typeof RANK] - RANK[typeof b as keyof typeof RANK];
  if (typeof a === 'string') return byCodePoint(natural(a), natural(b as string)) || byCodePoint(a, b as string);
  return a < b ? -1 : a > b ? 1 : 0;
}

type Predicate = (object: unknown) => boolean;
const NEVER: Predicate = () => false;

/** A where made into a predicate, once for a query: its fields found, its literals as their fields have them (one that is not one: none passes), in as a set. */
function compile(where: Where | undefined, catalog: Catalog): Predicate {
  if (!where) return () => true;
  switch (where.op) {
    case 'and': {
      const all = where.args.map((w) => compile(w, catalog));
      return (o) => {
        for (const p of all) if (!p(o)) return false;
        return true;
      };
    }
    case 'or': {
      const any = where.args.map((w) => compile(w, catalog));
      return (o) => {
        for (const p of any) if (p(o)) return true;
        return false;
      };
    }
    case 'not': {
      const p = compile(where.arg, catalog);
      return (o) => !p(o);
    }
  }
  const get = accessor(catalog, where.field);
  if (!get) return NEVER;
  const type = catalog.fields.get(where.field)?.type;
  switch (where.op) {
    case 'eq': {
      const l = typed(where.value, type);
      return l === undefined ? NEVER : (o) => some(get(o), (v) => v === l);
    }
    case 'ne': {
      const l = typed(where.value, type);
      return l === undefined ? () => true : (o) => !some(get(o), (v) => v === l);
    }
    case 'in': {
      const set = new Set(where.values.map((v) => typed(v, type)).filter((v) => v !== undefined));
      return (o) => some(get(o), (v) => set.has(v));
    }
    case 'exists':
      return (o) => {
        const cell = get(o);
        return !isMany(cell) || cell.length > 0;
      };
    case 'contains': {
      // Words in a string (a number, a time, a bool has none).
      const words = asciiLower(where.value);
      return (o) => some(get(o), (v) => typeof v === 'string' && asciiLower(v).includes(words));
    }
    case 'range': {
      // A string's natural key: a declared field's single value's kept (as a sort keeps it), else made.
      const slot = catalog.slots.get(where.field);
      const at = slot !== undefined && !catalog.specs[slot].many ? catalog.specs.length + slot : undefined;
      const naturalOf = (o: unknown, v: string) => {
        if (at === undefined || typeof o !== 'object' || o === null) return natural(v);
        const row = rowOf(catalog, o);
        let n = row[at] as string | undefined;
        if (n === undefined) {
          n = natural(v);
          row[at] = n;
        }
        return n;
      };
      const bounds: [Value, (n: number) => boolean, string | undefined][] = [];
      for (const [bound, ok] of [
        [where.gt, (n: number) => n > 0],
        [where.gte, (n: number) => n >= 0],
        [where.lt, (n: number) => n < 0],
        [where.lte, (n: number) => n <= 0],
      ] as const) {
        if (bound === undefined) continue;
        const to = typed(bound, type);
        if (to === undefined) return NEVER;
        bounds.push([to, ok, typeof to === 'string' ? natural(to) : undefined]);
      }
      return (o) =>
        some(get(o), (v) => {
          for (const [to, ok, nat] of bounds) {
            if (typeof to !== typeof v) return false;
            const n = nat === undefined ? compare(v, to) : byCodePoint(naturalOf(o, v as string), nat) || byCodePoint(v as string, to as string);
            if (!ok(n)) return false;
          }
          return true;
        });
    }
  }
}

/** Whether an object is one the where asks for. For one now and then: its where made into a predicate each call (scan makes it once). */
export function matches(object: unknown, where: Where | undefined, fields: Fields): boolean {
  return compile(where, catalogOf(fields))(object);
}

/** Where a row sorts: what it sorts by (a many field: its least, its greatest descending), its key, its uid — each string with its natural key. */
interface Place {
  key: string;
  uid: string;
  by: (Value | undefined)[];
  natural: (string | undefined)[];
}

interface Row<O> extends Place {
  object: O;
}

function placeOf(key: string, uid: string, by: (Value | undefined)[]): Place {
  return { key, uid, by, natural: [...by, key].map((v) => (typeof v === 'string' ? natural(v) : undefined)) };
}

/** How rows are made in a sort's order: each sort field's value (and natural key) kept, as the object's key is. */
function rowMaker<O>(catalog: Catalog, sort: Sort): (object: O) => Row<O> {
  const n = catalog.specs.length;
  const fields = sort.map((s) => ({ get: accessor(catalog, s.field), slot: catalog.slots.get(s.field), desc: s.desc === true }));
  const kept = (object: unknown, at: number, make: () => string): string => {
    if (typeof object !== 'object' || object === null) return make();
    const row = rowOf(catalog, object);
    let v = row[at] as string | undefined;
    if (v === undefined) {
      v = make();
      row[at] = v;
    }
    return v;
  };
  return (object) => {
    const key = kept(object, 2 * n, () => keyOf(object));
    const by: (Value | undefined)[] = [];
    const nat: (string | undefined)[] = [];
    for (const f of fields) {
      const cell = f.get?.(object) ?? NONE;
      let v: Value | undefined;
      if (!isMany(cell)) v = cell;
      else if (cell.length === 1) v = cell[0];
      else if (cell.length > 1) v = [...cell].sort(compare)[f.desc ? cell.length - 1 : 0];
      by.push(v);
      // A single value of a declared field: its natural key kept; else made.
      nat.push(typeof v !== 'string' ? undefined : f.slot !== undefined && !isMany(cell) ? kept(object, n + f.slot, () => natural(v as string)) : natural(v));
    }
    nat.push(kept(object, 2 * n + 1, () => natural(key)));
    return { object, key, uid: uidOf(object) ?? '', by, natural: nat };
  };
}

/** a before b (below 0), after, the same — by the sort's fields in turn (none: last either way), then by key, then by uid. */
function order(a: Place, b: Place, sort: Sort): number {
  for (let i = 0; i < sort.length; i++) {
    const x = a.by[i];
    const y = b.by[i];
    if (x === undefined || y === undefined) {
      if (x !== y) return x === undefined ? 1 : -1;
      continue;
    }
    let n: number;
    const xn = a.natural[i];
    const yn = b.natural[i];
    if (xn !== undefined && yn !== undefined) n = byCodePoint(xn, yn) || byCodePoint(x as string, y as string);
    else if (typeof x === 'number' && typeof y === 'number') n = x - y;
    else n = compare(x, y);
    if (n) return sort[i].desc ? -n : n;
  }
  const k = sort.length;
  return byCodePoint(a.natural[k] as string, b.natural[k] as string) || byCodePoint(a.key, b.key) || byCodePoint(a.uid, b.uid);
}

/** The first k of these rows in order (a heap of k, when k is few of them; else all sorted). */
function first<O>(rows: Row<O>[], k: number, cmp: (a: Row<O>, b: Row<O>) => number): Row<O>[] {
  if (k <= 0) return [];
  if (k * 4 >= rows.length) return rows.sort(cmp).slice(0, k);
  // A heap with the last of the first k on top: one before it takes its place.
  const heap: Row<O>[] = [];
  const up = (i: number) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cmp(heap[i], heap[p]) <= 0) return;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const down = (i: number) => {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let top = i;
      if (l < heap.length && cmp(heap[l], heap[top]) > 0) top = l;
      if (r < heap.length && cmp(heap[r], heap[top]) > 0) top = r;
      if (top === i) return;
      [heap[i], heap[top]] = [heap[top], heap[i]];
      i = top;
    }
  };
  for (const row of rows) {
    if (heap.length < k) {
      heap.push(row);
      up(heap.length - 1);
    } else if (cmp(row, heap[0]) < 0) {
      heap[0] = row;
      down(0);
    }
  }
  return heap.sort(cmp);
}

/** What a cursor is of: its query's kind, scope, where, sort, and the versions of the fields it sorts by (FNV-1a of them). */
function cursorTag(query: Pick<ListQuery, 'kind' | 'scope' | 'where' | 'sort'>, fields: Fields): string {
  // As it means it: no desc as desc false, no scope as all, its namespaces in order, once each.
  const sort = (query.sort ?? []).map((s) => ({ field: s.field, desc: s.desc === true }));
  const scope = query.scope === undefined || query.scope === 'all' ? 'all' : [...new Set(query.scope.namespaces)].sort();
  const versions = sort.map((s) => fields.get(s.field)?.version ?? null);
  return fnv1a64(canonical([query.kind, scope, query.where ?? null, sort, versions]));
}

/** A cursor: past this place, of this query (opaque to whoever holds it). */
const cursorOf = (place: Place, tag: string): Cursor => JSON.stringify([1, tag, place.key, place.uid, place.by.map((v) => (v === undefined ? null : v))]);

/** The place a cursor is past — if it is one of this query's (its tag), of as many values as it sorts by. */
function fromCursor(cursor: unknown, tag: string, sorted: number): Place | undefined {
  if (typeof cursor !== 'string') return undefined;
  try {
    const c = JSON.parse(cursor) as unknown;
    if (!Array.isArray(c) || c.length !== 5) return undefined;
    const [version, of, key, uid, by] = c;
    if (version !== 1 || of !== tag || typeof key !== 'string' || typeof uid !== 'string' || !Array.isArray(by) || by.length !== sorted) return undefined;
    if (!by.every((v) => v === null || typed(v, undefined) !== undefined)) return undefined;
    return placeOf(
      key,
      uid,
      by.map((v) => (v === null ? undefined : v)),
    );
  } catch {
    return undefined;
  }
}

/** The fields a where asks by. */
function fieldsIn(where: Where | undefined, out: Set<FieldName>): Set<FieldName> {
  if (!where) return out;
  if (where.op === 'and' || where.op === 'or') {
    for (const w of where.args) fieldsIn(w, out);
  } else if (where.op === 'not') fieldsIn(where.arg, out);
  else out.add(where.field);
  return out;
}

/** How the fields asked by could not be worked out of the objects of one query: each object counted once a field (its first error told). */
function errorsOf(catalog: Catalog, used: ReadonlySet<FieldName>) {
  const counts = new Map<FieldName, FieldError>();
  const seen = new Map<FieldName, Set<object>>();
  return {
    note(o: unknown) {
      if (!catalog.anyFailed || typeof o !== 'object' || o === null) return;
      const of = catalog.failed.get(o);
      if (!of) return;
      for (const [name, e] of of) {
        if (!used.has(name)) continue;
        let s = seen.get(name);
        if (!s) {
          s = new Set();
          seen.set(name, s);
        }
        if (s.has(o)) continue;
        s.add(o);
        const had = counts.get(name);
        counts.set(name, { count: (had?.count ?? 0) + 1, code: had?.code ?? e.code, message: had?.message ?? e.message });
      }
    },
    told(): { fieldErrors?: Record<FieldName, FieldError> } {
      return counts.size ? { fieldErrors: Object.fromEntries(counts) } : {};
    },
  };
}

/** A list query's answer of these objects (checked: checkQuery): its window, how many in all, where the next starts. */
export function scan<O>(objects: Iterable<O>, query: ListQuery, fields: Fields): Pick<ListResult<O>, 'items' | 'total' | 'next' | 'fieldErrors'> {
  const catalog = catalogOf(fields);
  const sort = query.sort ?? [];
  const tag = cursorTag(query, fields);
  const holds = compile(query.where, catalog);
  const make = rowMaker<O>(catalog, sort);
  const after = query.page.after === undefined ? undefined : fromCursor(query.page.after, tag, sort.length);
  if (query.page.after !== undefined && !after) throw new Error('not a cursor of this query (checkQuery says so)');
  const errors = errorsOf(catalog, fieldsIn(query.where, new Set([...sort.map((x) => x.field), ...(query.select ?? [])])));
  let rows: Row<O>[] = [];
  let count = 0;
  for (const o of objects) {
    if (!holds(o)) {
      errors.note(o);
      continue;
    }
    count++;
    const row = make(o);
    errors.note(o);
    if (!after || order(row, after, sort) > 0) rows.push(row);
  }
  const offset = after ? 0 : (query.page.offset ?? 0);
  const left = rows.length;
  // A window past the end: nothing to order.
  rows = offset >= left ? [] : first(rows, offset + query.page.limit, (a, b) => order(a, b, sort)).slice(offset);
  const last = rows.at(-1);
  const select = query.select?.map((name) => ({ name, get: accessor(catalog, name), many: resolve(fields, name)?.many === true }));
  return {
    items: rows.map((r) => {
      const uid = uidOf(r.object);
      if (!select) return { key: r.key, uid, object: r.object };
      // Its own keys only (a field named __proto__ one of them).
      const values: Record<FieldName, Value | readonly Value[] | null> = Object.create(null);
      for (const s of select) {
        const cell = s.get?.(r.object) ?? NONE;
        values[s.name] = isMany(cell) ? (cell.length === 0 ? null : s.many ? cell : cell[0]) : s.many ? [cell] : cell;
      }
      errors.note(r.object);
      return { key: r.key, uid, values } satisfies Item<O>;
    }),
    total: { count, exact: true },
    ...(last && offset + rows.length < left ? { next: cursorOf(last, tag) } : {}),
    ...errors.told(),
  };
}

/** A count query's answer of these objects (checked): how many in all; by the groupBy field's values, the most first (ties in the model's order, none last), past top the rest. */
export function scanCount(objects: Iterable<unknown>, query: CountQuery, fields: Fields): Pick<CountResult, 'total' | 'groups' | 'rest' | 'fieldErrors'> {
  const catalog = catalogOf(fields);
  const holds = compile(query.where, catalog);
  const get = query.groupBy === undefined ? undefined : (accessor(catalog, query.groupBy) ?? (() => NONE));
  let count = 0;
  // By value (1 and "1" apart), and those with none.
  const groups = new Map<Value, number>();
  let none = 0;
  const errors = errorsOf(catalog, fieldsIn(query.where, new Set(query.groupBy === undefined ? [] : [query.groupBy])));
  for (const o of objects) {
    if (!holds(o)) {
      errors.note(o);
      continue;
    }
    count++;
    if (!get) {
      errors.note(o);
      continue;
    }
    const cell = get(o);
    errors.note(o);
    if (!isMany(cell)) groups.set(cell, (groups.get(cell) ?? 0) + 1);
    else if (!cell.length) none++;
    else for (const v of new Set(cell)) groups.set(v, (groups.get(v) ?? 0) + 1);
  }
  const total = { count, exact: true };
  if (!get) return { total, ...errors.told() };
  const all: Group[] = [...groups].map(([value, count]) => ({ value, count }));
  if (none) all.push({ value: null, count: none });
  all.sort((a, b) => b.count - a.count || (a.value === null ? 1 : b.value === null ? -1 : compare(a.value, b.value)));
  if (query.top === undefined || all.length <= query.top) return { total, groups: all, ...errors.told() };
  return { total, groups: all.slice(0, query.top), rest: all.slice(query.top).reduce((n, g) => n + g.count, 0), ...errors.told() };
}

/**
 * The most a query may ask: a where nested, its parts, in's values in all of
 * it; a window; the fields sorted by, selected; the namespaces of a scope;
 * a name, a path, a string literal (its length).
 */
export const LIMITS = { depth: 32, nodes: 1000, values: 1000, page: 10_000, sort: 16, select: 64, namespaces: 1000, text: 1024 } as const;

const TESTS = new Set(['eq', 'ne', 'in', 'range', 'exists', 'contains']);
const BOUNDS = ['gt', 'gte', 'lt', 'lte'] as const;
const PARTS = { get: ['kind', 'namespace', 'name'], list: ['kind', 'scope', 'where', 'sort', 'page', 'select'], count: ['kind', 'scope', 'where', 'groupBy', 'top'] } as const;

/**
 * Why a query of this kind (get, list, count) cannot be answered — not one
 * at all (anything may be given: from anyone), a field not known or not of
 * its kind, a path that is none, a value not of its field's type, a where
 * too deep or too big, more than LIMITS, a window that is none, a cursor not
 * of this query — or nothing (it is one: a GetQuery, ListQuery, CountQuery).
 */
export function checkQuery(query: unknown, fields: Fields, as: 'get' | 'list' | 'count'): QueryError | undefined {
  const bad = (code: string, message: string): QueryError => ({ code, message });
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const only = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every((k) => keys.includes(k));
  const text = (v: unknown): v is string => typeof v === 'string' && v.length <= LIMITS.text;
  if (!isObject(query) || !text(query.kind) || !query.kind) return bad('bad_query', 'a query is an object with its kind');
  const q = query;
  const extra = Object.keys(q).find((k) => !(PARTS[as] as readonly string[]).includes(k));
  if (extra !== undefined) return bad('bad_query', `a ${as} query has no ${extra}`);
  if (as === 'get') return text(q.name) && q.name && (q.namespace === undefined || text(q.namespace)) ? undefined : bad('bad_query', 'a get query is { kind, namespace?, name }');

  const field = (name: unknown): QueryError | undefined => {
    if (!text(name)) return bad('bad_field', `${JSON.stringify(name)?.slice(0, 64)} is not a field's name`);
    const spec = fields.get(name);
    if (spec?.kinds && !spec.kinds.includes(q.kind as string)) return bad('not_for_kind', `${name} is not a field of ${q.kind}`);
    if (!spec && !isPath(name)) return bad('unknown_field', `no field ${name}`);
    const path = spec ? spec.value : name;
    if (typeof path !== 'string') return undefined;
    try {
      compilePath(path);
      return undefined;
    } catch (e) {
      return bad('bad_path', spec ? `${name}: ${(e as Error).message}` : (e as Error).message);
    }
  };
  /** A literal of a field, as its type takes it (a string field's: a string); its kind, typed. */
  const literal = (name: string, v: unknown, of: 'value' | 'bound' = 'value'): QueryError | undefined => {
    const ok = of === 'bound' ? typeof v === 'number' || typeof v === 'string' : typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
    if (!ok || (typeof v === 'number' && !Number.isFinite(v)) || (typeof v === 'string' && v.length > LIMITS.text))
      return bad('bad_value', `${JSON.stringify(v)?.slice(0, 64)} is not a ${of} (${name})`);
    const type = fields.get(name)?.type;
    const fits = !type || (type === 'string' ? typeof v === 'string' : typed(v, type) !== undefined);
    return fits ? undefined : bad('bad_value', `${JSON.stringify(v)} is not a ${type} (${name})`);
  };

  let nodes = 0;
  let values = 0;
  const where = (w: unknown, depth: number): QueryError | undefined => {
    if (++nodes > LIMITS.nodes) return bad('too_big', `a where holds at most ${LIMITS.nodes} parts`);
    if (depth > LIMITS.depth) return bad('too_deep', `a where is at most ${LIMITS.depth} deep`);
    if (!isObject(w)) return bad('bad_where', `${JSON.stringify(w)?.slice(0, 64)} is not a where`);
    if (w.op === 'and' || w.op === 'or') {
      if (!only(w, ['op', 'args']) || !Array.isArray(w.args)) return bad('bad_where', `${w.op} is { op, args: [...] }`);
      for (const a of w.args) {
        const wrong = where(a, depth + 1);
        if (wrong) return wrong;
      }
      return undefined;
    }
    if (w.op === 'not') return only(w, ['op', 'arg']) ? where(w.arg, depth + 1) : bad('bad_where', 'not is { op, arg }');
    if (typeof w.op !== 'string' || !TESTS.has(w.op)) return bad('bad_where', `no test ${JSON.stringify(w.op)?.slice(0, 64)}`);
    const wrong = field(w.field);
    if (wrong) return wrong;
    const name = w.field as string;
    const type = fields.get(name)?.type;
    switch (w.op) {
      case 'eq':
      case 'ne':
        return only(w, ['op', 'field', 'value']) ? literal(name, w.value) : bad('bad_where', `${w.op} is { field, op, value }`);
      case 'contains':
        if (!only(w, ['op', 'field', 'value']) || !text(w.value)) return bad('bad_where', 'contains is { field, op, value: words }');
        return type && type !== 'string' ? bad('bad_where', `contains is of a string field, not a ${type} (${name})`) : undefined;
      case 'exists':
        return only(w, ['op', 'field']) ? undefined : bad('bad_where', 'exists is { field, op }');
      case 'in':
        if (!only(w, ['op', 'field', 'values']) || !Array.isArray(w.values)) return bad('bad_where', 'in is { field, op, values: [...] }');
        values += w.values.length;
        if (values > LIMITS.values) return bad('too_big', `a where's ins hold at most ${LIMITS.values} values`);
        return w.values.map((v) => literal(name, v)).find(Boolean);
      default: {
        const given = BOUNDS.filter((b) => w[b] !== undefined);
        if (!only(w, ['op', 'field', ...BOUNDS]) || !given.length) return bad('bad_where', 'range is { field, op, gt?, gte?, lt?, lte? }, a bound at least');
        const no = given.map((b) => literal(name, w[b], 'bound')).find(Boolean);
        if (no) return no;
        // Bounds of one kind (a number and a string: no value is within both).
        const kinds = new Set(given.map((b) => typeof typed(w[b], type)));
        return kinds.size > 1 ? bad('bad_where', `a range's bounds are of one kind (${name})`) : undefined;
      }
    }
  };

  if (q.scope !== undefined && q.scope !== 'all') {
    const ns = isObject(q.scope) && only(q.scope, ['namespaces']) ? q.scope.namespaces : undefined;
    if (!Array.isArray(ns) || !ns.every((n) => text(n))) return bad('bad_scope', "a scope is 'all' or { namespaces: [...] }");
    if (ns.length > LIMITS.namespaces) return bad('too_big', `a scope holds at most ${LIMITS.namespaces} namespaces`);
  }
  const wrong = q.where === undefined ? undefined : where(q.where, 1);
  if (wrong) return wrong;

  if (as === 'count') {
    if (q.top !== undefined && !(Number.isInteger(q.top) && (q.top as number) > 0)) return bad('bad_top', 'top is 1 or more');
    return q.groupBy === undefined ? undefined : field(q.groupBy);
  }
  if (q.sort !== undefined) {
    if (!Array.isArray(q.sort)) return bad('bad_sort', 'a sort is [{ field, desc? }, ...]');
    if (q.sort.length > LIMITS.sort) return bad('too_big', `a sort is by at most ${LIMITS.sort} fields`);
    for (const s of q.sort) {
      if (!isObject(s) || !only(s, ['field', 'desc']) || (s.desc !== undefined && typeof s.desc !== 'boolean')) return bad('bad_sort', 'a sort is [{ field, desc? }, ...]');
      const no = field(s.field);
      if (no) return no;
    }
  }
  if (q.select !== undefined) {
    if (!Array.isArray(q.select)) return bad('bad_select', 'a select is [field, ...]');
    if (q.select.length > LIMITS.select) return bad('too_big', `a select is of at most ${LIMITS.select} fields`);
    const no = q.select.map(field).find(Boolean);
    if (no) return no;
  }
  const page = q.page;
  if (!isObject(page) || !only(page, ['limit', 'offset', 'after']) || !Number.isInteger(page.limit) || (page.limit as number) < 1 || (page.limit as number) > LIMITS.page)
    return bad('bad_page', `a page has a limit, 1 to ${LIMITS.page}`);
  if (page.offset !== undefined && page.after !== undefined) return bad('bad_page', 'a page starts at an offset or after a cursor, not both');
  if (page.offset !== undefined && !(Number.isSafeInteger(page.offset) && (page.offset as number) >= 0)) return bad('bad_page', 'an offset is 0 or more');
  const list = q as unknown as ListQuery;
  if (page.after !== undefined && !fromCursor(page.after, cursorTag(list, fields), list.sort?.length ?? 0)) return bad('bad_cursor', 'not a cursor of this query');
  return undefined;
}
