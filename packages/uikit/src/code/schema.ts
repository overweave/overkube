import { type Document, isMap, isPair, isScalar, isSeq, LineCounter, type Node, parseAllDocuments, parseDocument } from 'yaml';

/*
 * A YAML text against a JSON Schema (an OpenAPI one: a kind's, as the
 * cluster serves it — $ref to components or definitions, allOf of one, a
 * map's additionalProperties, Kubernetes' int-or-string and preserved
 * unknown fields): what is wrong where (an unknown field, a value of the
 * wrong type, a required field missing), what a place may hold (the keys
 * of the object the cursor is in, a field's enum), what a key is (its
 * description). Pure: no editor's; the editor (editor.ts) asks it.
 */

export interface Schema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  items?: Schema;
  required?: string[];
  enum?: unknown[];
  $ref?: string;
  allOf?: Schema[];
  format?: string;
  'x-kubernetes-int-or-string'?: boolean;
  'x-kubernetes-preserve-unknown-fields'?: boolean;
  components?: { schemas?: Record<string, Schema> };
  definitions?: Record<string, Schema>;
}

/** A place in a document: object keys and sequence items (any item: '*'). */
export type Path = readonly (string | number)[];

/** What is wrong, where (offsets in the text). */
export interface Problem {
  from: number;
  to: number;
  message: string;
  severity: 'error' | 'warning';
}

/** A schema as its $ref and allOf say (resolved against the root's components or definitions). */
export function resolve(root: Schema, s: Schema | undefined, depth = 0): Schema | undefined {
  if (!s || depth > 32) return s;
  if (s.$ref) {
    const name = s.$ref.replace(/^#\/(components\/schemas|definitions)\//, '');
    // One it does not have: nothing known of it (no check, no completion).
    const target = root.components?.schemas?.[name] ?? root.definitions?.[name];
    const { $ref: _ref, ...rest } = s;
    return resolve(root, merge([target ?? {}, rest]), depth + 1);
  }
  if (s.allOf?.length) {
    const { allOf, ...rest } = s;
    return merge([...allOf.map((part) => resolve(root, part, depth + 1) ?? {}), rest]);
  }
  return s;
}

const typeOf = (s: Schema): string | undefined => (Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type);
const looseObject = (s: Schema) => s['x-kubernetes-preserve-unknown-fields'] || (!s.properties && s.additionalProperties === undefined && typeOf(s) === 'object');

/** Schemas as one: each one's words over the one before's — their properties and required fields together, not one's over another's. */
function merge(parts: readonly Schema[]): Schema {
  const out: Schema = {};
  for (const p of parts) {
    const properties = p.properties || out.properties ? { ...out.properties, ...p.properties } : undefined;
    const required = p.required || out.required ? [...new Set([...(out.required ?? []), ...(p.required ?? [])])] : undefined;
    Object.assign(out, p, properties ? { properties } : {}, required ? { required } : {});
  }
  return out;
}

/** The schema of what a field (or an item) holds. */
export function child(root: Schema, s: Schema | undefined, key: string | number): Schema | undefined {
  const r = resolve(root, s);
  if (!r) return undefined;
  if (key === '*' || typeof key === 'number') return resolve(root, r.items);
  const prop = r.properties?.[key];
  if (prop) return resolve(root, prop);
  return typeof r.additionalProperties === 'object' ? resolve(root, r.additionalProperties) : undefined;
}

/** The schema at a path (none: not known there). */
export function schemaAt(root: Schema, path: Path): Schema | undefined {
  let s: Schema | undefined = resolve(root, root);
  for (const key of path) {
    s = child(root, s, key);
    if (!s) return undefined;
  }
  return s;
}

/** A field's type, as said beside it (int-or-string, an array of what…). */
export function typeName(root: Schema, s: Schema | undefined): string {
  const r = resolve(root, s);
  if (!r) return '';
  if (r['x-kubernetes-int-or-string']) return 'int-or-string';
  const t = typeOf(r);
  if (t === 'array') return `[]${typeName(root, r.items) || 'any'}`;
  if (t === 'object' && typeof r.additionalProperties === 'object') return `map[string]${typeName(root, r.additionalProperties) || 'any'}`;
  return t ?? (r.properties ? 'object' : '');
}

export function parse(text: string): { doc: Document; lines: LineCounter } {
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines, keepSourceTokens: false, prettyErrors: false });
  return { doc, lines };
}

const rangeOf = (n: { range?: [number, number, number] | null } | null | undefined, fallback = 0): [number, number] =>
  n?.range ? [n.range[0], Math.max(n.range[0] + 1, n.range[1])] : [fallback, fallback + 1];

/** What is wrong in the text: its YAML (as the parser says it), then against the schema (none: its YAML alone). */
export function problems(text: string, root: Schema | undefined): Problem[] {
  // Its documents (--- between them: as YAML has them), each one's errors; against the schema, one alone.
  const docs = parseAllDocuments(text);
  const all = Array.isArray(docs) ? docs : [];
  const out: Problem[] = all.flatMap((d) =>
    d.errors.map((e): Problem => ({ from: e.pos[0], to: Math.max(e.pos[0] + 1, e.pos[1]), message: e.message.split('\n')[0] ?? e.message, severity: 'error' })),
  );
  const doc = all.length === 1 ? all[0] : undefined;
  if (out.length || !root || !doc?.contents) return out;
  const walk = (node: Node | null, s: Schema | undefined) => {
    const r = resolve(root, s);
    if (!r || !node) return;
    const t = typeOf(r);
    const [from, to] = rangeOf(node as never);
    if (isMap(node)) {
      if (t && t !== 'object') return void out.push({ from, to, message: `Expected ${typeName(root, r)}, got an object`, severity: 'error' });
      const keys = new Set<string>();
      for (const pair of node.items) {
        const key = isScalar(pair.key) ? String(pair.key.value) : '';
        keys.add(key);
        const [kf, kt] = rangeOf(pair.key as never, from);
        const sub = child(root, r, key);
        if (!sub && r.properties && r.additionalProperties !== true && !looseObject(r)) out.push({ from: kf, to: kt, message: `Unknown field "${key}"`, severity: 'warning' });
        else walk(pair.value as Node | null, sub);
      }
      const missing = (r.required ?? []).filter((k) => !keys.has(k));
      if (missing.length && node.items[0]) {
        const [kf, kt] = rangeOf(node.items[0].key as never, from);
        out.push({ from: kf, to: kt, message: `Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`, severity: 'error' });
      }
      return;
    }
    if (isSeq(node)) {
      if (t && t !== 'array') return void out.push({ from, to, message: `Expected ${typeName(root, r)}, got a list`, severity: 'error' });
      for (const item of node.items) walk(item as Node | null, r.items);
      return;
    }
    if (isScalar(node)) {
      const v = node.value;
      if (v === null || (r['x-kubernetes-int-or-string'] && (typeof v === 'number' || typeof v === 'string'))) return;
      const ok =
        !t ||
        (t === 'string' && typeof v === 'string') ||
        (t === 'integer' && typeof v === 'number' && Number.isInteger(v)) ||
        (t === 'number' && typeof v === 'number') ||
        (t === 'boolean' && typeof v === 'boolean') ||
        (t === 'object' && looseObject(r));
      if (!ok)
        out.push({
          from,
          to,
          message: `Expected ${typeName(root, r)}, got ${typeof v === 'number' ? (Number.isInteger(v) ? 'an integer' : 'a number') : typeof v === 'boolean' ? 'a boolean' : 'a string'}`,
          severity: 'error',
        });
      else if (r.enum && !r.enum.includes(v)) out.push({ from, to, message: `One of: ${r.enum.join(', ')}`, severity: 'error' });
    }
  };
  walk(doc.contents as Node, root);
  return out;
}

/** The path of the key (or value) at an offset, and that key's range: none, not on a field. */
export function fieldAt(text: string, offset: number): { path: Path; from: number; to: number } | undefined {
  const { doc } = parse(text);
  let found: { path: Path; from: number; to: number } | undefined;
  const walk = (node: unknown, path: Path) => {
    if (isMap(node))
      for (const pair of node.items) {
        if (!isPair(pair)) continue;
        const key = isScalar(pair.key) ? String(pair.key.value) : '';
        const [kf, kt] = rangeOf(pair.key as never);
        if (offset >= kf && offset <= kt) found = { path: [...path, key], from: kf, to: kt };
        walk(pair.value, [...path, key]);
      }
    else if (isSeq(node))
      node.items.forEach((item, i) => {
        walk(item, [...path, i]);
      });
  };
  walk(doc.contents, []);
  return found;
}

/** Where a path is in the text (a key's range; an item's; its value's): none, not there. */
export function rangeOfPath(text: string, path: Path): { from: number; to: number } | undefined {
  const { doc } = parse(text);
  let node: unknown = doc.contents;
  let at: [number, number] | undefined;
  for (const key of path) {
    if (isMap(node)) {
      const pair = node.items.find((p) => isScalar(p.key) && String(p.key.value) === String(key));
      if (!pair) return at && { from: at[0], to: at[1] };
      at = rangeOf(pair.key as never);
      node = pair.value;
    } else if (isSeq(node) && typeof key === 'number') {
      node = node.items[key];
      if (!node) return at && { from: at[0], to: at[1] };
      at = rangeOf(node as never);
    } else return at && { from: at[0], to: at[1] };
  }
  return at && { from: at[0], to: at[1] };
}

interface Line {
  /** Where its key starts (after any "- "), none: no key. */
  keyCol: number;
  /** Where its "- " is (an item begun), none: not. */
  dashCol: number;
  key: string;
  /** Its key has nothing after its colon (what follows is under it). */
  opens: boolean;
}

function lineOf(text: string): Line | undefined {
  if (!text.trim() || text.trimStart().startsWith('#')) return undefined;
  const m = /^(\s*)((?:-\s+)*)(.*)$/.exec(text);
  if (!m) return undefined;
  const indent = m[1]?.length ?? 0;
  const dashes = m[2] ?? '';
  // Its key: up to a colon a space or the line's end follows (a value's own colons, a URL's, kept out).
  const k = /^("[^"]*"|'[^']*'|[^\s#:'"][^#]*?)\s*:(?:\s+(.*)|$)/.exec(m[3] ?? '');
  const rest = (k?.[2] ?? '').trim();
  return {
    keyCol: indent + dashes.length,
    dashCol: dashes ? indent + dashes.lastIndexOf('-') : -1,
    key: (k?.[1] ?? '').replace(/^["']|["']$/g, ''),
    opens: !!k && (!rest || rest.startsWith('#')),
  };
}

/**
 * Where the cursor is, by the indentation of the lines above it (the text may not parse while typed): the path of
 * the object it is in, and what it types — a key (its start, what is typed of it, the keys there already), or a
 * value (of which key).
 */
export function placeAt(
  text: string,
  offset: number,
):
  | { path: Path; typing: 'key'; from: number; prefix: string; col: number; siblings: Set<string> }
  | { path: Path; typing: 'value'; key: string; from: number; prefix: string }
  | undefined {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const before = text.slice(lineStart, offset);
  const all = text.split('\n');
  const row = text.slice(0, lineStart).split('\n').length - 1;
  const keyTyped = /^(\s*)((?:-\s+)*)([\w./-]*)$/.exec(before);
  const valueTyped = /^(\s*)((?:-\s+)*)([\w./-]+):\s+([\w./-]*)$/.exec(before);
  const m = keyTyped ?? valueTyped;
  if (!m) return undefined;
  const col = (m[1]?.length ?? 0) + (m[2]?.length ?? 0);
  // Up from it: each line less indented that opens a key is a step of its path; an item begun ("- ") at its key's column, a step into a list.
  const path: (string | number)[] = [];
  let target = col;
  let inItem = (m[2] ?? '') !== '';
  if (inItem) {
    path.unshift('*');
    target = (m[1]?.length ?? 0) + (m[2] ?? '').lastIndexOf('-');
  }
  for (let i = row - 1; i >= 0 && target > 0; i--) {
    const l = lineOf(all[i] ?? '');
    if (!l) continue;
    if (inItem && l.keyCol <= target && l.dashCol < 0 && l.key && l.opens) {
      path.unshift(l.key);
      target = l.keyCol;
      inItem = false;
      continue;
    }
    if (l.dashCol >= 0 && l.keyCol === target && !inItem) {
      // The first key of the item the cursor's object is.
      path.unshift('*');
      target = l.dashCol;
      inItem = true;
      continue;
    }
    if (l.keyCol < target && l.key && l.opens) {
      path.unshift(l.key);
      target = l.keyCol;
      if (l.dashCol >= 0) {
        path.unshift('*');
        target = l.dashCol;
        inItem = true;
      }
    }
  }
  if (valueTyped) return { path, typing: 'value', key: valueTyped[3] ?? '', from: offset - (valueTyped[4]?.length ?? 0), prefix: valueTyped[4] ?? '' };
  // The keys of its object there already: those at its column, up and down, till one less indented.
  const siblings = new Set<string>();
  for (const step of [-1, 1])
    for (let i = row + step; i >= 0 && i < all.length; i += step) {
      const l = lineOf(all[i] ?? '');
      if (!l) continue;
      if (l.keyCol < col || (l.dashCol >= 0 && l.keyCol === col && step < 0 && !(m[2] ?? ''))) {
        if (l.dashCol >= 0 && l.keyCol === col && l.key) siblings.add(l.key);
        break;
      }
      if (l.keyCol === col && l.key) siblings.add(l.key);
    }
  return { path, typing: 'key', from: offset - (keyTyped?.[3]?.length ?? 0), prefix: keyTyped?.[3] ?? '', col, siblings };
}

/** What may be typed at the cursor: the fields of its object (but those there), or a field's values (its enum, true or false). */
export function completions(
  text: string,
  offset: number,
  root: Schema,
): { from: number; options: { label: string; type: string; detail: string; info?: string; apply: string }[] } | undefined {
  const at = placeAt(text, offset);
  if (!at) return undefined;
  if (at.typing === 'value') {
    const s = schemaAt(root, [...at.path, at.key]);
    const values = s?.enum ?? (typeOf(s ?? {}) === 'boolean' ? [true, false] : []);
    if (!values.length) return undefined;
    return { from: at.from, options: values.map((v) => ({ label: String(v), type: 'enum', detail: '', apply: String(v) })) };
  }
  const s = schemaAt(root, at.path);
  if (!s?.properties) return undefined;
  const pad = ' '.repeat(at.col + 2);
  const options = Object.entries(s.properties)
    .filter(([k]) => !at.siblings.has(k))
    .map(([k, p]) => {
      const r = resolve(root, p);
      const t = r ? typeOf(r) : undefined;
      // An object's: its key, and the next line under it; a list's, its first item begun; else its key and a space.
      const apply = t === 'object' && !r?.['x-kubernetes-int-or-string'] ? `${k}:\n${pad}` : t === 'array' ? `${k}:\n${pad}- ` : `${k}: `;
      return { label: k, type: 'property', detail: typeName(root, p), ...(r?.description ? { info: r.description } : {}), apply };
    });
  return { from: at.from, options };
}
