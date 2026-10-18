import { Environment } from '@marcbachmann/cel-js';
import { byCodePoint, canonical, fnv1a64 } from '@overkube/query';
import { type Bound, calls, type Estimate, estimate, fingerprint, reads } from './ast.ts';
import { parseQuantity, Quantity } from './quantity.ts';

/*
 * CEL as overkube's fields have it — the same wherever it runs (the page,
 * a server on Node: this module, this library, at these versions:
 * SEMANTICS). An expression is of one object, self, and nothing else (a
 * name it does not know: it is no expression). What it is given and gives:
 * - of self, only what it reads (the paths its tree reads: the rest is not
 *   made into CEL's values); a whole number within a double's integers an
 *   int, any other a double (JSON's 2.0 is JS's 2: an int — 2.0 * 0.5 no
 *   overload; a schema's types, not yet); a null a key not there (as
 *   omitempty has it);
 * - a missing value none, not an error (no such key, no such index past
 *   a list's end: as apiserver tables have a missing cell) — any other
 *   error an error (a CelError: its code);
 * - its answer data: an int or double as a number (an int past a double's
 *   integers, the nearest), a timestamp as ms, a string, a bool, a list of
 *   them; a map, a list of lists: no answer of a field (bad_shape);
 * - Kubernetes' functions it needs: of lists, sum, indexOf, lastIndexOf,
 *   slice, flatten (CEL's equality, its types); of strings, CEL's own
 *   (lastIndexOf, substring — by code point); quantity(), as
 *   apimachinery has it (./quantity.ts);
 * - functions of CEL (options.functions): name(self), each worked out once
 *   for each object however many fields ask it, its answer or its error;
 *   calling one another, never round.
 * An expression given by anyone (options.bound): what it may cost
 * estimated as it is made, refused past the bound; its input held to the
 * bound (a longer list or string of self: too_big); no regexes (JS's
 * backtrack) unless options.regex. Strings compared by < inside an
 * expression: by UTF-16 code units (a query's order is scan's, not CEL's).
 */

/** What answers mean, wherever they are worked out: this library, this module — another, another meaning (a field's version is of it). */
export const SEMANTICS = 'cel-js@8.0.0;apimachinery@0.35;overkube-cel@3';

/** Why an expression or a function cannot be one, or cannot be worked out: its code. */
export class CelError extends Error {
  readonly code: string;
  /** Where in the expression it is wrong (its characters, from start to end), when that is known. */
  readonly at?: { start: number; end: number };
  constructor(code: string, message: string, at?: { start: number; end: number }) {
    super(message);
    this.name = 'CelError';
    this.code = code;
    if (at) this.at = at;
  }
}

/** An expression made: what it says of an object (none: undefined; any other error: a CelError). */
export type CelProgram = (object: unknown) => unknown;

export interface CelOptions {
  /** The most nodes an expression may be of, how deep (a function's: ten times as many). */
  limits?: { maxAstNodes?: number; maxDepth?: number };
  /** Functions of an object written in CEL, by name: name(self) anywhere (calling one another, never round). */
  functions?: Readonly<Record<string, string>>;
  /** Expressions given by anyone: held to what they may cost, their input to its size. */
  bound?: Bound;
  /** Regexes allowed (matches, find): only for expressions trusted. */
  regex?: boolean;
}

/** What is known of an expression before it runs. */
export interface Inspection {
  fingerprint: string;
  /** Functions of CEL it calls, and those they call. */
  functions: string[];
  estimate: Estimate;
}

/** A key not there, an index past a list's end: none (the library's codes). */
const MISSING = new Set(['no_such_key', 'index_out_of_bounds']);
/** No overload for a value (a variable's none: null), for what it is used in — a field the object has no value of. */
const NO_OVERLOAD = new Set(['no_such_overload', 'no_matching_overload']);
const DEFAULT_BOUND: Bound = { size: 1000, cost: 1_000_000 };

/**
 * A whole object made into CEL's values (whole numbers within a double's
 * integers ints; a null or undefined key left out; __proto__ a key like
 * any) — once for each object and bound: one made within a bound was held
 * to it (its strings, lists, maps no longer), one made without, to none.
 */
const wholes = new Map<number, WeakMap<object, unknown>>();
function toCel(v: unknown, bound?: Bound): unknown {
  if (typeof v === 'number') return Number.isSafeInteger(v) ? BigInt(v) : v;
  if (typeof v === 'string' && bound && v.length > bound.size) throw new CelError('too_big', `a string of ${v.length} (at most ${bound.size})`);
  // A time: CEL's timestamp.
  if (typeof v !== 'object' || v === null || v instanceof Date) return v;
  const size = bound?.size ?? Number.POSITIVE_INFINITY;
  let whole = wholes.get(size);
  if (!whole) {
    whole = new WeakMap();
    wholes.set(size, whole);
  }
  const had = whole.get(v);
  if (had !== undefined) return had;
  const entries = Array.isArray(v) ? undefined : Object.entries(v).filter(([, x]) => x !== null && x !== undefined);
  const length = Array.isArray(v) ? v.length : (entries?.length ?? 0);
  if (length > size) throw new CelError('too_big', `a ${Array.isArray(v) ? 'list' : 'map'} of ${length} (at most ${size})`);
  const out = Array.isArray(v) ? v.map((x) => toCel(x, bound)) : Object.fromEntries((entries ?? []).map(([k, x]) => [k, toCel(x, bound)]));
  whole.set(v, out);
  return out;
}

/** What of self an expression reads: a trie of keys (a whole one, all of it). */
interface Trie {
  whole: boolean;
  keys: Map<string, Trie>;
}
function trieOf(paths: string[][]): Trie {
  const root: Trie = { whole: false, keys: new Map() };
  for (const p of paths) {
    let at = root;
    for (const k of p) {
      if (at.whole) break;
      let next = at.keys.get(k);
      if (!next) {
        next = { whole: false, keys: new Map() };
        at.keys.set(k, next);
      }
      at = next;
    }
    at.whole = true;
    at.keys.clear();
  }
  return root;
}

/** An object as CEL's values, only what a trie reads of it (a key not there, or a null: left out). */
function project(raw: unknown, trie: Trie, bound?: Bound): unknown {
  if (trie.whole || typeof raw !== 'object' || raw === null || Array.isArray(raw)) return toCel(raw, bound);
  const out: Record<string, unknown> = {};
  for (const [k, sub] of trie.keys) {
    if (!Object.hasOwn(raw, k)) continue;
    const v = (raw as Record<string, unknown>)[k];
    // Its own key, whatever its name (__proto__ too).
    if (v !== null && v !== undefined) Object.defineProperty(out, k, { value: project(v, sub, bound), enumerable: true, writable: true, configurable: true });
  }
  return out;
}

/** An answer as data (see above); a map, a list of lists: bad_shape. */
function fromCel(v: unknown, top = true): unknown {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || v === undefined) return v;
  if (v === null) return undefined;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'object' && typeof (v as { valueOf(): unknown }).valueOf() === 'bigint') return Number((v as { valueOf(): bigint }).valueOf());
  if (Array.isArray(v) && top) return v.map((x) => fromCel(x, false));
  throw new CelError('bad_shape', `a field's answer is a value or a list of them, not ${Array.isArray(v) ? 'a list of lists' : 'a map'}`);
}

/** A number as it is: an int or uint as a bigint (a uint's wrapper unwrapped), a double as a number; else none. */
function numeric(x: unknown): bigint | number | undefined {
  if (typeof x === 'bigint' || typeof x === 'number') return x;
  if (typeof x === 'object' && x !== null && !Array.isArray(x) && typeof (x as { valueOf(): unknown }).valueOf() === 'bigint') return (x as { valueOf(): bigint }).valueOf();
  return undefined;
}

/** Two values equal, as CEL has them (numbers of any type by value, exactly; lists and maps by what is in them). */
function equal(a: unknown, b: unknown): boolean {
  const x = numeric(a);
  const y = numeric(b);
  if (x !== undefined || y !== undefined) {
    if (x === undefined || y === undefined) return false;
    if (typeof x === typeof y) return x === y;
    const [big, num] = typeof x === 'bigint' ? [x, y as number] : [y as bigint, x as number];
    return Number.isInteger(num) && BigInt(num) === big;
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && !Array.isArray(a) && !Array.isArray(b) && !(a instanceof Date)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => Object.hasOwn(b, k) && equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime());
}

/** sum(): of ints an int, of doubles a double (none: 0); else no such overload (as the k8s lists library has it). */
function sum(l: unknown[]): unknown {
  if (l.every((x) => typeof x === 'bigint')) {
    const total = (l as bigint[]).reduce((a, x) => a + x, 0n);
    if (total > 2n ** 63n - 1n || total < -(2n ** 63n)) throw new CelError('numeric_overflow', 'sum() past an int64');
    return total;
  }
  if (l.every((x) => typeof x === 'number')) return (l as number[]).reduce((a, x) => a + x, 0);
  throw new CelError('no_such_overload', 'sum() is of a list of ints or of doubles');
}

/** A list's values once each, in their order (CEL's equality). */
const distinct = (l: unknown[]) => l.filter((x, i) => l.findIndex((y) => equal(x, y)) === i);

/** A list in order: of numbers by value, of strings by code point, of bools false first — of one kind (else no such overload). */
function sorted(l: unknown[]): unknown[] {
  const kinds = new Set(l.map((x) => (numeric(x) !== undefined ? 'number' : typeof x)));
  if (kinds.size > 1 || [...kinds].some((k) => !['number', 'string', 'boolean'].includes(k)))
    throw new CelError('no_such_overload', 'sort() is of a list of numbers, strings or bools');
  return [...l].sort((a, b) => {
    if (typeof a === 'string') return byCodePoint(a, b as string);
    const x = numeric(a) ?? Number(a);
    const y = numeric(b) ?? Number(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

const index = (l: unknown[], x: unknown, last: boolean) => {
  for (let i = last ? l.length - 1 : 0; last ? i >= 0 : i < l.length; i += last ? -1 : 1) if (equal(l[i], x)) return BigInt(i);
  return -1n;
};

function environment(limits: CelOptions['limits']): Environment {
  return new Environment({
    unlistedVariablesAreDyn: false,
    enableOptionalTypes: true,
    homogeneousAggregateLiterals: false,
    limits: { maxAstNodes: 1000, maxDepth: 64, ...limits },
  })
    .registerVariable('self', 'dyn')
    .registerType('Quantity', Quantity)
    .registerFunction('list<dyn>.sum(): dyn', sum)
    .registerFunction('list<dyn>.indexOf(dyn): int', (l: unknown[], x: unknown) => index(l, x, false))
    .registerFunction('list<dyn>.lastIndexOf(dyn): int', (l: unknown[], x: unknown) => index(l, x, true))
    .registerFunction('list<dyn>.slice(int, int): list<dyn>', (l: unknown[], a: bigint, b: bigint) => {
      if (a < 0n || b < a || b > BigInt(l.length)) throw new CelError('invalid_argument', `slice ${a}:${b} of a list of ${l.length}`);
      return l.slice(Number(a), Number(b));
    })
    .registerFunction('list<dyn>.flatten(): list<dyn>', (l: unknown[]) => l.flatMap((x) => (Array.isArray(x) ? x : [x])))
    .registerFunction('list<dyn>.distinct(): list<dyn>', distinct)
    .registerFunction('list<dyn>.sort(): list<dyn>', sorted)
    .registerFunction('quantity(string): Quantity', (s: string) => {
      const q = parseQuantity(s);
      if (!q) throw new CelError('invalid_argument', `${JSON.stringify(s.slice(0, 64))} is not a quantity`);
      return q;
    })
    .registerFunction('isQuantity(string): bool', (s: string) => parseQuantity(s) !== undefined)
    .registerFunction('Quantity.isInteger(): bool', (q: Quantity) => q.integer() !== undefined)
    .registerFunction('Quantity.asInteger(): int', (q: Quantity) => {
      const v = q.integer();
      if (v === undefined) throw new CelError('invalid_argument', 'cannot convert value to integer');
      return v;
    })
    .registerFunction('Quantity.asApproximateFloat(): double', (q: Quantity) => q.approximate());
}

/** An error as a CelError (its code kept, its message's first line). */
const celError = (e: unknown, code = 'cel_error') =>
  e instanceof CelError ? e : new CelError((e as { code?: string }).code ?? code, ((e as Error).message ?? String(e)).split('\n')[0]);

/** CEL made for fields: functions of CEL declared, expressions compiled once (a CelError if one is none) and run on each object. */
export function createCel(options: CelOptions = {}) {
  const env = environment(options.limits);
  const source = options.functions ?? {};
  const names = new Set(Object.keys(source));
  type Fn = { run: (context: { self: unknown }) => unknown; trie: Trie; done: WeakMap<object, { value: unknown } | { error: unknown }> };
  const made = new Map<string, Fn>();
  /** Which object a projection was made of (a function of CEL given self: its own projection of it). */
  const rawOf = new WeakMap<object, object>();

  // Each function declared, then each made (in an environment with all of them: they call one another).
  for (const name of names) {
    try {
      env.registerFunction(`${name}(dyn): dyn`, (self: unknown) => {
        const fn = made.get(name) as Fn;
        if (typeof self !== 'object' || self === null) return fn.run({ self });
        // Given self (a projection): its own projection of the object, worked out once for it; given any other value of CEL: that, as it is.
        const raw = rawOf.get(self);
        const key = raw ?? self;
        let had = fn.done.get(key);
        if (!had) {
          try {
            let own = self;
            if (raw) {
              own = project(raw, fn.trie, options.bound) as object;
              rawOf.set(own, raw);
            }
            had = { value: fn.run({ self: own }) };
          } catch (error) {
            had = { error };
          }
          fn.done.set(key, had);
        }
        if ('error' in had) throw had.error;
        return had.value;
      });
    } catch (e) {
      throw new CelError('bad_function', `${name}: ${celError(e).message}`);
    }
  }
  const trees = new Map<string, ReturnType<Environment['parse']>>();
  // Checked and made in the environment of all of them (a function's limits ten times an expression's).
  const own = names.size ? env.clone({ limits: { maxAstNodes: 10_000, maxDepth: 640, ...options.limits } }) : env;
  const callsOf = new Map<string, string[]>();
  for (const name of names) {
    try {
      const checked = own.check(source[name]);
      if (!checked.valid) throw checked.error ?? new Error('not an expression');
      const parsed = own.parse(source[name]);
      trees.set(name, parsed);
      callsOf.set(
        name,
        [...calls(parsed.ast as never)].filter((c) => names.has(c)),
      );
    } catch (e) {
      // Not one (its parse, its types, a name it does not know) — or too deep to look into (past the stack).
      throw new CelError('bad_function', `${name}: ${celError(e).message}`);
    }
  }
  // Never round: each function's calls, followed.
  const seen = new Set<string>();
  const visit = (n: string, path: string[]) => {
    if (path.includes(n)) throw new CelError('bad_function', `${[...path, n].join(' → ')}: a function calls itself`);
    if (seen.has(n)) return;
    for (const c of callsOf.get(n) ?? []) visit(c, [...path, n]);
    seen.add(n);
  };
  for (const n of names) visit(n, []);
  // In order of their calls: each one's estimate of those it calls.
  const estimates = new Map<string, Estimate>();
  const versions = new Map<string, string>();
  const ordered: string[] = [];
  const place = (n: string) => {
    if (ordered.includes(n)) return;
    for (const c of callsOf.get(n) ?? []) place(c);
    ordered.push(n);
  };
  names.forEach(place);
  for (const n of ordered) {
    const tree = trees.get(n) as ReturnType<Environment['parse']>;
    try {
      estimates.set(n, estimate(tree.ast as never, options.bound ?? DEFAULT_BOUND, estimates));
      versions.set(n, fnv1a64(canonical([fingerprint(tree.ast), ...(callsOf.get(n) ?? []).map((c) => versions.get(c))])));
      made.set(n, { run: tree, trie: trieOf(reads(tree.ast as never, names)), done: new WeakMap() });
    } catch (e) {
      throw new CelError('bad_function', `${n}: ${celError(e).message}`);
    }
  }

  /** The functions of CEL an expression calls, and those they call. */
  const used = (direct: Iterable<string>) => {
    const out = new Set<string>();
    const add = (n: string) => {
      if (out.has(n) || !names.has(n)) return;
      out.add(n);
      (callsOf.get(n) ?? []).forEach(add);
    };
    [...direct].forEach(add);
    return [...out].sort();
  };

  const parse = (expression: string) => {
    try {
      const checked = env.check(expression);
      if (!checked.valid) throw checked.error ?? new CelError('bad_cel', 'not an expression');
      const type = String(checked.type ?? 'dyn');
      if (type.startsWith('map') || type.startsWith('list<list') || type.startsWith('list<map'))
        throw new CelError('bad_shape', `a field's answer is a value or a list of them, not ${type}`);
      return env.parse(expression);
    } catch (e) {
      // Not an expression (a parse, a type, a name it does not know): bad_cel — but a shape ours to tell.
      if (e instanceof CelError && e.code === 'bad_shape') throw e;
      throw new CelError('bad_cel', celError(e).message);
    }
  };

  return {
    /** What answers mean here: the library, this module, the functions of CEL (by version). */
    semantics: fnv1a64(canonical([SEMANTICS, [...versions].sort()])),

    /** A function of CEL's version: its tree, those it calls (theirs). */
    functionVersion: (name: string) => versions.get(name),

    /** What is known of an expression before it runs (a CelError if it is none). */
    inspect(expression: string): Inspection {
      const tree = parse(expression);
      return { fingerprint: fingerprint(tree.ast), functions: used(calls(tree.ast as never)), estimate: estimate(tree.ast as never, options.bound ?? DEFAULT_BOUND, estimates) };
    },

    /**
     * Expressions of these variables beside self (a user's filter: a kind's
     * fields by their short names), each of its CEL type (string, bool, list,
     * map, google.protobuf.Timestamp, dyn): checked as declared (a CelError
     * where it is wrong: at), run as any (none: null), its tree
     * (tree); made as compile makes one given by anyone (held to the
     * bound), run on an object and its variables' values (compile).
     */
    withVariables(declared: Readonly<Record<string, string>>) {
      const variables = Object.keys(declared);
      // Checked as they are declared (a string compared to a number: wrong, where it is); run as any (a variable with none: null).
      const typed = env.clone();
      const scoped = env.clone();
      for (const v of variables) {
        typed.registerVariable(v, declared[v]);
        scoped.registerVariable(v, 'dyn');
      }
      const located = (e: unknown) => {
        const range = (e as { range?: { start: number; end: number } } | undefined)?.range;
        const message = ((e as Error | undefined)?.message ?? 'not an expression').split('\n')[0];
        return new CelError('bad_cel', message, range ? { start: range.start, end: range.end } : undefined);
      };
      const made = (expression: string) => {
        let checked: ReturnType<Environment['check']>;
        try {
          checked = typed.check(expression);
        } catch (e) {
          throw located(e);
        }
        if (!checked.valid) throw located(checked.error);
        return { run: scoped.parse(expression), type: checked.type ?? 'dyn' };
      };
      return {
        /** Its tree and its type (bool, dyn, string, …), or a CelError where it is wrong. */
        tree(expression: string): { tree: unknown; type: string } {
          const { run, type } = made(expression);
          return { tree: run.ast, type };
        },
        /** Worked out of an object, the variables' values given: a variable with none (null) where a value is used, none (not an error). */
        compile(expression: string): (object: unknown, values: Readonly<Record<string, unknown>>) => unknown {
          const { run } = made(expression);
          const bound = options.bound;
          if (bound) {
            const e = estimate(run.ast as never, bound, estimates);
            if (e.regex && !options.regex) throw new CelError('bad_cel', 'no regexes here (matches, find)');
            if (e.cost > bound.cost) throw new CelError('too_costly', `it may cost ${e.cost} (at most ${bound.cost})`);
            if (e.size > bound.cost) throw new CelError('too_costly', `it may make a list or string of ${e.size} (at most ${bound.cost})`);
          }
          const trie = trieOf(reads(run.ast as never, names));
          return (object, values) => {
            try {
              const self = project(object, trie, bound);
              if (typeof self === 'object' && self !== null && typeof object === 'object' && object !== null) rawOf.set(self, object);
              const vars = Object.fromEntries(variables.map((v) => [v, toCel(values[v] ?? null, bound)]));
              return fromCel(run({ ...vars, self }));
            } catch (e) {
              const code = (e as { code?: string }).code;
              if (code !== undefined && MISSING.has(code)) return undefined;
              if (code !== undefined && NO_OVERLOAD.has(code) && /\bnull\b/.test((e as Error).message)) return undefined;
              throw celError(e);
            }
          };
        },
      };
    },

    /**
     * An expression made (a CelError if it is none, or, given by anyone,
     * past what it may cost); trusted (ours: the core's fields), not held
     * to the bound.
     */
    compile(expression: string, how: { trusted?: boolean } = {}): CelProgram {
      const run = parse(expression);
      const bound = how.trusted ? undefined : options.bound;
      if (bound) {
        const e = estimate(run.ast as never, bound, estimates);
        if (e.regex && !options.regex) throw new CelError('bad_cel', 'no regexes here (matches, find)');
        if (e.cost > bound.cost) throw new CelError('too_costly', `it may cost ${e.cost} (at most ${bound.cost})`);
        if (e.size > bound.cost) throw new CelError('too_costly', `it may make a list or string of ${e.size} (at most ${bound.cost})`);
      }
      const trie = trieOf(reads(run.ast as never, names));
      return (object) => {
        try {
          const self = project(object, trie, bound);
          if (typeof self === 'object' && self !== null && typeof object === 'object' && object !== null) rawOf.set(self, object);
          return fromCel(run({ self }));
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code !== undefined && MISSING.has(code)) return undefined;
          throw celError(e);
        }
      };
    },
  };
}

export type Cel = ReturnType<typeof createCel>;
