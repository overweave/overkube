/*
 * What an expression's tree says of it, before it runs (the library's
 * tree: { op, args }; a call: call [name, args], a method: rcall [name,
 * receiver, args], a field: . / .? [of, key]):
 * - the functions it calls;
 * - its fingerprint: the tree as text (its spaces, its comments aside);
 * - what of self it reads: paths of keys — a whole object where it is
 *   read other than by a key (passed on, iterated, indexed by what is
 *   worked out); self passed to a function of CEL, nothing (it reads its
 *   own);
 * - what it may cost (as cel-go's estimator, roughly): every list and
 *   string of self taken to be of `size` (the input held to it), a
 *   comprehension its body as many times as its list is long, a string or
 *   list put together as long as both; regexes told apart (JS's backtrack).
 */

interface Node {
  op: string;
  args: unknown;
}

const isNode = (x: unknown): x is Node => typeof x === 'object' && x !== null && 'op' in x;

/** The nodes under a node (in its args, however nested). */
function children(n: Node): Node[] {
  const out: Node[] = [];
  const go = (x: unknown) => {
    if (isNode(x)) out.push(x);
    else if (Array.isArray(x)) x.forEach(go);
  };
  go(n.args);
  return out;
}

const MACROS = new Set(['map', 'filter', 'exists', 'all', 'exists_one']);
const REGEX = new Set(['matches', 'find', 'findAll']);

/** The functions and methods a tree calls (not CEL's macros, not cel.bind). */
export function calls(root: Node): Set<string> {
  const out = new Set<string>();
  const go = (n: Node) => {
    if (n.op === 'call') out.add((n.args as [string])[0]);
    if (n.op === 'rcall') {
      const [name, on] = n.args as [string, Node];
      if (!MACROS.has(name) && !(name === 'bind' && isNode(on) && on.op === 'id' && on.args === 'cel')) out.add(name);
    }
    children(n).forEach(go);
  };
  go(root);
  return out;
}

/** A tree as text: the same tree, the same text, however it was spaced. */
export function fingerprint(root: unknown): string {
  if (isNode(root)) return `(${root.op} ${fingerprint(root.args)})`;
  if (Array.isArray(root)) return `[${root.map(fingerprint).join(' ')}]`;
  if (typeof root === 'bigint') return `${root}i`;
  if (typeof root === 'number') return `${root}d`;
  if (typeof root === 'object' && root !== null && typeof (root as { valueOf(): unknown }).valueOf() === 'bigint') return `${(root as { valueOf(): bigint }).valueOf()}u`;
  return JSON.stringify(root) ?? 'null';
}

/** The keys from self a node is, if it is self's keys one after another (self.a.?b["c"]); else none. */
function chain(n: Node): string[] | undefined {
  if (n.op === 'id') return n.args === 'self' ? [] : undefined;
  if (n.op === '.' || n.op === '.?') {
    const [of, key] = n.args as [Node, string];
    const keys = chain(of);
    return keys && [...keys, key];
  }
  if (n.op === '[]' || n.op === '[?]') {
    const [of, key] = n.args as [Node, Node];
    const keys = chain(of);
    return keys && isNode(key) && key.op === 'value' && typeof key.args === 'string' ? [...keys, key.args] : undefined;
  }
  return undefined;
}

/** The paths of self a tree reads (each whole under it); self passed to one of these functions: nothing. */
export function reads(root: Node, functions: ReadonlySet<string>): string[][] {
  const out: string[][] = [];
  const go = (n: Node) => {
    const keys = chain(n);
    if (keys) {
      out.push(keys);
      return;
    }
    if (n.op === 'call') {
      const [name, args] = n.args as [string, unknown[]];
      if (functions.has(name) && args.length === 1 && isNode(args[0]) && args[0].op === 'id' && args[0].args === 'self') return;
    }
    children(n).forEach(go);
  };
  go(root);
  return out;
}

export interface Bound {
  /** How long a list or string of self is taken to be (and held to). */
  size: number;
  /** The most an expression may cost. */
  cost: number;
}

export interface Estimate {
  cost: number;
  /** The longest list or string it may make. */
  size: number;
  regex: boolean;
}

/** What a tree may cost, roughly; functions of CEL, what each costs. */
export function estimate(root: Node, bound: Bound, functions: ReadonlyMap<string, Estimate>): Estimate {
  let regex = false;
  type E = { cost: number; size: number };
  const go = (n: Node, vars: ReadonlyMap<string, E>): E => {
    const sum = (ns: Node[], v = vars) => ns.map((c) => go(c, v)).reduce((a, e) => ({ cost: a.cost + e.cost, size: Math.max(a.size, e.size) }), { cost: 0, size: 0 });
    switch (n.op) {
      case 'value':
        return { cost: 1, size: typeof n.args === 'string' ? n.args.length : 1 };
      case 'id':
        return n.args === 'self' ? { cost: 1, size: bound.size } : (vars.get(n.args as string) ?? { cost: 1, size: bound.size });
      case 'list':
      case 'map': {
        const s = sum(children(n));
        return { cost: s.cost + 1, size: children(n).length };
      }
      case '.':
      case '.?':
      case '[]':
      case '[?]': {
        const s = sum(children(n));
        return { cost: s.cost + 1, size: bound.size };
      }
      case '+': {
        const [a, b] = children(n).map((c) => go(c, vars));
        const size = a.size + b.size;
        return { cost: a.cost + b.cost + size, size };
      }
      case 'in': {
        const [a, b] = children(n).map((c) => go(c, vars));
        return { cost: a.cost + b.cost + b.size, size: 1 };
      }
      case '?:': {
        const [c, t, f] = children(n).map((x) => go(x, vars));
        return { cost: c.cost + Math.max(t.cost, f.cost), size: Math.max(t.size, f.size) };
      }
      case 'call': {
        const [name, args] = n.args as [string, Node[]];
        const s = sum(args.filter(isNode));
        if (REGEX.has(name)) regex = true;
        const own = functions.get(name);
        if (own?.regex) regex = true;
        return { cost: s.cost + 1 + (own?.cost ?? s.size), size: own?.size ?? Math.max(1, s.size) };
      }
      case 'rcall': {
        const [name, on, args] = n.args as [string, Node, Node[]];
        if (name === 'bind' && on.op === 'id' && on.args === 'cel') {
          const [v, init, body] = args;
          const i = go(init, vars);
          const b = go(body, new Map([...vars, [v.args as string, { cost: 1, size: i.size }]]));
          return { cost: i.cost + b.cost, size: b.size };
        }
        const r = go(on, vars);
        if (MACROS.has(name)) {
          // Its body, as many times as the list is long (its element: as long as any of self's).
          const v = args[0].args as string;
          const inner = new Map([...vars, [v, { cost: 1, size: bound.size }]]);
          const body = args.slice(1).map((b) => go(b, inner));
          const each = body.reduce((a, e) => a + e.cost, 0) + 1;
          return { cost: r.cost + r.size * each, size: name === 'map' || name === 'filter' ? r.size : 1 };
        }
        if (REGEX.has(name)) regex = true;
        const s = sum(args.filter(isNode));
        const size = name === 'flatten' ? r.size * bound.size : Math.max(1, ['slice', 'reverse', 'sort', 'distinct'].includes(name) ? r.size : 1);
        return { cost: r.cost + s.cost + r.size + 1, size };
      }
      default: {
        const s = sum(children(n));
        return { cost: s.cost + 1, size: 1 };
      }
    }
  };
  const e = go(root, new Map());
  return { cost: e.cost, size: e.size, regex };
}
