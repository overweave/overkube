import type { Path } from './model.ts';
import { byCodePoint, fromUtf8, utf8 } from './text.ts';

/*
 * kubectl's JSONPath (k8s.io/client-go/util/jsonpath), what of it a column
 * or a field says — additionalPrinterColumns, -o custom-columns — and as it
 * means it there, missing keys allowed (as the apiserver's tables have
 * them): one action, braces round it or not ({.a.b}, .a.b; $ and @ the
 * object), of
 * - .name: a key of a map, its own (of anything else, nothing); a \ takes
 *   the next character as it is (.labels.app\.kubernetes\.io/name), as
 *   kubectl drops every \ of a name;
 * - .*: every value of a map (in the order they are: Go's is any), every
 *   element, a string's UTF-8 bytes;
 * - [n], [a:b], [a:b:step], [*] (all of it): of an array — n from its end
 *   below 0; out of its bounds, or not an array: an error;
 * - ['a.b']: as kubectl reads it, .a.b (a key with dots: \. in a name);
 * - [?(@.x)] (those with it), [?(@.x == "y")] — ==, !=, <, <=, >, >= of one
 *   value to another, each a path of the element or a string ('' or "",
 *   Go's escapes: \x and octal bytes of UTF-8), a number (an int; with a .,
 *   a float), true or false: of an array, values of one kind (an int of an
 *   int, a float of a float — JSON's 2.0 is JS's 2, an int; strings by code
 *   point; bools, == and != only); else an error.
 * Not ..(all the way down), unions ([0,1]), ranges, text outside the braces:
 * a path saying them is none (a PathError, where). An error worked out
 * (kubectl's: its whole answer none) is a PathEvalError.
 */

type Op = '==' | '!=' | '<' | '<=' | '>' | '>=';

/** A literal of a filter: a float apart from an int (Go's kinds), as kubectl parses it; a string not UTF-8, its bytes (as Go compares it). */
type Literal = { readonly value: boolean } | { readonly value: string; readonly bytes?: readonly number[] } | { readonly value: number; readonly float: boolean };
type Side = Literal | { readonly path: readonly Step[] };

type Step =
  | { readonly at: 'name'; readonly name: string }
  | { readonly at: 'all' }
  | { readonly at: 'slice'; readonly from?: number; readonly to?: number; readonly derived: boolean; readonly step?: number }
  | { readonly at: 'filter'; readonly left: Side; readonly op?: Op; readonly right?: Side };

/** A path that is not one: where, and why. */
export class PathError extends Error {
  readonly path: string;
  readonly at: number;
  constructor(path: string, at: number, why: string) {
    super(`${why} at ${at} of ${path}`);
    this.name = 'PathError';
    this.path = path;
    this.at = at;
  }
}

/** A path that cannot be worked out of an object (kubectl's error): why. */
export class PathEvalError extends Error {
  constructor(why: string) {
    super(why);
    this.name = 'PathEvalError';
  }
}

const OPS: readonly Op[] = ['==', '!=', '<=', '>=', '<', '>'];
/** Where a name ends (kubectl's terminators). */
const ENDS = new Set(['.', ',', '[', ']', '$', '@', '{', '}', ' ', '\t', '\r', '\n']);
const SLICE = /^(-?\d*)(:-?\d*)?(:-?\d*)?$/;
/** A number, as kubectl takes one: a sign or a digit first, then digits and dots. */
const NUMBER = /^[+\-\d][\d.]*$/;
const ESCAPES: Record<string, string> = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\' };

/** A quoted string's text, as Go's strconv.UnquoteChar reads it (its quote escaped, not the other; \x and octal: bytes of UTF-8 — not UTF-8: its bytes too); not one: why. */
function unquote(body: string, quote: string): { text: string; bytes?: number[] } | { why: string } {
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== '\\') {
      if (c === quote) return { why: 'a quote not escaped' };
      const cp = body.codePointAt(i) as number;
      if (cp > 0xffff) i++;
      bytes.push(...utf8(String.fromCodePoint(cp)));
      continue;
    }
    const e = body[++i];
    if (e === undefined) return { why: 'an escape at the end' };
    if (e in ESCAPES) bytes.push(ESCAPES[e].charCodeAt(0));
    else if (e === quote) bytes.push(e.charCodeAt(0));
    else if (e === 'x' || e === 'u' || e === 'U') {
      const n = e === 'x' ? 2 : e === 'u' ? 4 : 8;
      const hex = body.slice(i + 1, i + 1 + n);
      if (!new RegExp(`^[0-9a-fA-F]{${n}}$`).test(hex)) return { why: `\\${e} wants ${n} hex digits` };
      const code = Number.parseInt(hex, 16);
      if (e === 'x') bytes.push(code);
      else if (code > 0x10ffff || (code >= 0xd800 && code < 0xe000)) return { why: `\\${e}${hex} is no character` };
      else bytes.push(...utf8(String.fromCodePoint(code)));
      i += n;
    } else if (/[0-7]/.test(e)) {
      const oct = body.slice(i, i + 3);
      if (!/^[0-7]{3}$/.test(oct) || Number.parseInt(oct, 8) > 255) return { why: 'an octal escape is three digits, to \\377' };
      bytes.push(Number.parseInt(oct, 8));
      i += 2;
    } else return { why: `no escape \\${e}` };
  }
  const text = fromUtf8(bytes);
  const again = utf8(text);
  return again.length === bytes.length && again.every((b, i) => b === bytes[i]) ? { text } : { text, bytes };
}

/** The steps of a path, or why it is none: in braces, the action ends at its first } not quoted or escaped. */
function parse(text: string): Step[] {
  if (!text.startsWith('{')) return steps(text, text, 0);
  let quote: string | undefined;
  for (let i = 1; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (quote) {
      if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '}') {
      if (i !== text.length - 1) throw new PathError(text, i + 1, 'one action, nothing after it');
      return steps(text.slice(1, i), text, 1);
    }
  }
  throw new PathError(text, text.length, 'a brace not closed');
}

/** The steps of a path's text (of whole, from base: for where it went wrong). */
function steps(src: string, whole: string, base: number): Step[] {
  let i = 0;
  const fail = (why: string, at = i): never => {
    throw new PathError(whole, base + at, why);
  };
  const out: Step[] = [];
  if (!/^[.[$@ \t]/.test(src)) fail('a path starts with ., [, $ or @');
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '$' || c === '@') {
      i++;
    } else if (c === '.') {
      if (src[i + 1] === '.') fail('.. (all the way down) is not taken');
      i++;
      let name = '';
      const start = i;
      while (i < src.length && !ENDS.has(src[i])) {
        if (src[i] === '\\') {
          i++;
          if (i < src.length && src[i] !== '\\') name += src[i];
          i++;
        } else name += src[i++];
      }
      out.push(name === '*' && i - start === 1 ? { at: 'all' } : { at: 'name', name });
    } else if (src.startsWith('[?(', i)) {
      out.push(filter());
    } else if (c === '[') {
      const end = src.indexOf(']', i);
      if (end < 0) fail('an array not closed');
      const inner = src.slice(i + 1, end);
      const at = i;
      i = end + 1;
      if (inner.includes(',')) fail('unions ([a,b]) are not taken', at);
      const key = /^'([^']*)'$/.exec(inner);
      if (key) {
        out.push(...steps(`.${key[1]}`, whole, base + at + 1));
        continue;
      }
      const m = SLICE.exec(inner === '*' ? ':' : inner) ?? fail(`no index ${inner}`, at + 1);
      // Each part a whole number kubectl's Atoi takes (not "-", not past a safe integer).
      const [from, to, step] = [m[1], m[2]?.slice(1), m[3]?.slice(1)].map((v) => {
        if (!v) return undefined;
        const n = Number(v);
        return v === '-' || !Number.isSafeInteger(n) ? fail(`array index ${v} is not a number`, at + 1) : n;
      });
      if (m[3] !== undefined && step !== undefined && step <= 0) fail('a step is above 0', at + 1);
      out.push({ at: 'slice', from, to: m[2] === undefined ? (from ?? 0) + 1 : to, derived: m[2] === undefined, step });
    } else fail(`"${c}" not wanted`);
  }
  return out;

  /** A side of a filter: a string, true or false, a number (a sign or a digit first), else a path. */
  function side(text: string, at: number): Side {
    const r = text.trim();
    if (r[0] === '"' || r[0] === "'") {
      const s = r.length > 1 && r.endsWith(r[0]) ? unquote(r.slice(1, -1), r[0]) : { why: 'a quote not closed' };
      if ('why' in s) throw new PathError(whole, at, s.why);
      return s.bytes ? { value: s.text, bytes: s.bytes } : { value: s.text };
    }
    if (r === 'true' || r === 'false') return { value: r === 'true' };
    if (NUMBER.test(r)) {
      // An int as Atoi takes it; else a float, as ParseFloat does ("1." too).
      const float = !/^[+-]?\d+$/.test(r);
      const n = Number(r.endsWith('.') ? r.slice(0, -1) : r);
      if (!Number.isFinite(n) || (r.match(/\./g)?.length ?? 0) > 1 || (!float && !Number.isSafeInteger(n))) throw new PathError(whole, at, `no number ${r}`);
      return { value: n, float };
    }
    return { path: steps(r, whole, at) };
  }

  function filter(): Step {
    const start = i;
    i += 3;
    let quote: string | undefined;
    let closed = false;
    for (; ; i++) {
      const r = src[i];
      if (r === undefined || r === '\n') fail('a filter not closed', start);
      if (r === '"' || r === "'") {
        if (!quote) quote = r;
        else if (src[i - 1] !== '\\' && r === quote) closed = true;
      } else if (r === ')' && (quote === undefined) === !closed) break;
    }
    const body = src.slice(start + 3, i);
    if (src[++i] !== ']') fail('"]" wanted');
    i++;
    const m = /^([^!<>=]+)([!<>=]+)(.+?)$/.exec(body);
    const at = base + start + 3;
    if (!m) return { at: 'filter', left: side(body, at) };
    const op = OPS.find((o) => o === m[2]);
    if (!op) throw new PathError(whole, at + m[1].length, `no operator ${m[2]}`);
    return { at: 'filter', left: side(m[1], at), op, right: side(m[3], at + m[1].length + m[2].length) };
  }
}

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** A value's kind as Go's templates tell them: a number an int or a float (2.0 in JSON: JS's 2, an int). */
const kindOf = (v: unknown, float?: boolean) =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? ((float ?? !Number.isInteger(v)) ? 'float' : 'int') : typeof v;

/** One value against another, as Go's templates compare them: of one kind (bools: == and != only; strings: by code point); else kubectl's error. */
function compare(left: Side1, op: Op, right: Side1): boolean {
  const k = left.kind;
  if (k !== right.kind || !(k === 'int' || k === 'float' || k === 'string' || k === 'boolean') || (k === 'boolean' && op !== '==' && op !== '!='))
    throw new PathEvalError(`${k} and ${right.kind} do not compare by ${op}`);
  const n =
    k !== 'string'
      ? (left.value as number) - (right.value as number)
      : left.bytes || right.bytes
        ? bytewise(left.bytes ?? utf8(left.value as string), right.bytes ?? utf8(right.value as string))
        : byCodePoint(left.value as string, right.value as string);
  switch (op) {
    case '==':
      return k === 'boolean' ? left.value === right.value : n === 0;
    case '!=':
      return k === 'boolean' ? left.value !== right.value : n !== 0;
    case '<':
      return n < 0;
    case '<=':
      return n <= 0;
    case '>':
      return n > 0;
    case '>=':
      return n >= 0;
  }
}

/** A value of a side: what it is, its kind; a string not UTF-8, its bytes. */
interface Side1 {
  value: unknown;
  kind: string;
  bytes?: readonly number[];
}

/** Bytes in order, as Go compares strings. */
function bytewise(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/** A side's values of an element: a literal's own; a path's, all it reaches. */
function sideOf(s: Side, el: unknown): Side1[] {
  if ('path' in s) return walk([el], s.path).map((value) => ({ value, kind: kindOf(value) }));
  return [{ value: s.value, kind: kindOf(s.value, 'float' in s ? s.float : undefined), ...('bytes' in s && s.bytes ? { bytes: s.bytes } : {}) }];
}

/** The one value a filter's side has (none: undefined; more: kubectl's error). */
function one<T>(values: T[]): T | undefined {
  if (values.length > 1) throw new PathEvalError('can only compare one element at a time');
  return values[0];
}

function walk(nodes: readonly unknown[], path: readonly Step[]): unknown[] {
  let at = nodes as unknown[];
  for (const step of path) {
    const next: unknown[] = [];
    for (const node of at) {
      // A null: nothing of it — but a filter of it, kubectl's error (it filters what is there).
      if ((node === null && step.at !== 'filter') || node === undefined) continue;
      switch (step.at) {
        case 'name':
          if (isMap(node) && Object.hasOwn(node, step.name) && node[step.name] !== undefined) next.push(node[step.name]);
          break;
        case 'all':
          if (Array.isArray(node)) for (const v of node) next.push(v);
          else if (isMap(node)) for (const k of Object.keys(node)) next.push(node[k]);
          else if (typeof node === 'string') for (const b of utf8(node)) next.push(b);
          break;
        case 'slice': {
          if (!Array.isArray(node)) throw new PathEvalError(`${kindOf(node)} is not array or slice`);
          const n = node.length;
          let from = step.from ?? 0;
          let to = step.to ?? n;
          if (from < 0) from += n;
          if (to < 0 || (to === 0 && step.derived)) to += n;
          if (to === from) break;
          if (from >= n || from < 0) throw new PathEvalError(`array index out of bounds: index ${from}, length ${n}`);
          if (to > n || to < 0) throw new PathEvalError(`array index out of bounds: index ${to - 1}, length ${n}`);
          if (from > to) throw new PathEvalError(`starting index ${from} is greater than ending index ${to}`);
          for (let i = from; i < to; i += step.step ?? 1) next.push(node[i]);
          break;
        }
        case 'filter': {
          if (!Array.isArray(node)) throw new PathEvalError(`${kindOf(node)} is not array or slice and cannot be filtered`);
          for (const el of node) {
            if (step.op === undefined) {
              // There, as kubectl has it: what its path reached — on an error, what it had reached then (so: there).
              let there: boolean;
              try {
                there = sideOf(step.left, el).length > 0;
              } catch {
                there = true;
              }
              if (there) next.push(el);
              continue;
            }
            const left = one(sideOf(step.left, el));
            if (left === undefined) continue;
            const right = one(sideOf(step.right as Side, el));
            if (right === undefined) continue;
            if (compare(left, step.op, right)) next.push(el);
          }
          break;
        }
      }
    }
    at = next;
  }
  return at;
}

/** The paths made, the most recently asked last: at most so many kept (one asked anew, made anew: it is quick). */
export const PATHS_KEPT = 512;
const compiled = new Map<string, (object: unknown) => unknown[]>();

/** A path, made once while it is asked (the last PATHS_KEPT of them): what it reaches of an object (an error worked out: a PathEvalError). Not a path: a PathError. */
export function compilePath(path: Path | string): (object: unknown) => unknown[] {
  let fn = compiled.get(path);
  if (fn) {
    compiled.delete(path);
  } else {
    const parsed = parse(path);
    fn = (object) => walk([object], parsed);
    if (compiled.size >= PATHS_KEPT) compiled.delete(compiled.keys().next().value as string);
  }
  compiled.set(path, fn);
  return fn;
}

/** What a path reaches of an object, every value in order (an error worked out: a PathEvalError). */
export function valuesAt(object: unknown, path: Path | string): unknown[] {
  return compilePath(path)(object);
}

/** Whether a field's name is a path (.a.b), not a declared field's: by its start. */
export function isPath(field: string): field is Path {
  return field.startsWith('.');
}
