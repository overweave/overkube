// How a scan holds up, and whether it answers right: pods by the 10k, 100k,
// 300k, uneven as a cluster's are (times out of order and in any zone, finer
// than ms; fields missing; mixed kinds of value; names that tie but for zeros
// or case, numbers of 40 digits, non-ASCII past U+FFFF and full-width; pods of
// one key apart by uid; big ones).
// - Right: every query against an answer worked out apart — its own plain
//   code, its own order (the model's rules written anew, not the package's
//   compare); all of it the same whatever order the objects come in; whole
//   answers walked by cursor (sorts of every sort) and by offset; every
//   count's groups and rest.
// - Time: the median of 5 (and the slowest), warmed up; cold — new objects,
//   nothing of them worked out — once.
// - Memory: each in a process of its own (nothing else of the run in its
//   heap; one that fails, the run fails): what is kept of the fields; paths
//   typed into a search; fields defined again and again.
// - A watch's churn: 1% of them changed (their values too), again and again.
// - Queries at their limits: in of 1000, a page at the end, a window of
//   10 000, a range of strings; checkQuery of the worst, its answers checked.
// Not a test that passes, but it stops at a wrong answer. Run:
// npm run stress -w packages/query [-- 10000,100000] (node 24: its types stripped).
import { checkQuery, type Fields, type Item, LIMITS, type ListQuery, matches, scan, scanCount, valuesAt, type Where } from '../src/index.ts';

declare const process: { argv: string[]; execPath: string; execArgv: string[]; memoryUsage(): { heapUsed: number } };
declare const gc: (() => void) | undefined;

const SIZES = (process.argv[2] ?? '10000,100000,300000').split(',').map(Number);

/** A seeded random (mulberry32): the same run each time. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- The model's order, written anew from its rules (not the package's compare) ---

/** A string's parts: ASCII case aside, a run of digits one part (its number), each other character one (its code point). */
function parts(s: string): ({ n: bigint } | { c: number })[] {
  const out: ({ n: bigint } | { c: number })[] = [];
  const folded = s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  for (const m of folded.matchAll(/\d+|[^\d]/gsu)) out.push(/^\d/.test(m[0]) ? { n: BigInt(m[0]) } : { c: m[0].codePointAt(0) as number });
  return out;
}
const points = (s: string) => [...s].map((c) => c.codePointAt(0) as number);
function lexical(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}
/** Bool, number, string apart; strings by their parts (a number before any character but U+0000), then by code point. */
function reference(a: unknown, b: unknown): number {
  const rank = (v: unknown) => (typeof v === 'boolean' ? 0 : typeof v === 'number' ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a !== 'string') return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
  const pa = parts(a);
  const pb = parts(b as string);
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if ('n' in x && 'n' in y) {
      if (x.n !== y.n) return x.n < y.n ? -1 : 1;
    } else if ('n' in x) return (y as { c: number }).c === 0 ? 1 : -1;
    else if ('n' in y) return x.c === 0 ? -1 : 1;
    else if (x.c !== y.c) return x.c - y.c;
  }
  return pa.length - pb.length || lexical(points(a), points(b as string));
}

// --- Pods ---

const PHASES = ['Running', 'Running', 'Running', 'Running', 'Pending', 'Succeeded', 'Failed'];
const NAMESPACES = Array.from({ length: 200 }, (_, i) => `ns-${i}`);
const NAMES = ['app', 'App', 'web', 'wéb', 'db', 'cache', 'x', 'Ärger', '😀app', 'ａｐｐ', 'x\u0001y'];
const ZONES = [0, 0, 0, 120, -300, 330, 840, -720];
/** Each pod's creation time, as ms (its text in any zone, finer than ms: the oracle's to know apart). */
const CREATED = new WeakMap<object, number>();

/** A time as RFC 3339 in a zone (minutes east): to the second, or to the ms, or finer (cut off: the same ms); and the ms it says. */
function rfc3339(ms: number, zone: number, rnd: () => number): [string, number] {
  const local = new Date(ms + zone * 60_000).toISOString().slice(0, 19);
  const fine = rnd() < 0.3;
  const frac = fine ? `.${String(ms % 1000).padStart(3, '0')}${rnd() < 0.5 ? String(Math.floor(rnd() * 1e6)).padStart(6, '0') : ''}` : '';
  const z = zone === 0 ? 'Z' : `${zone < 0 ? '-' : '+'}${String(Math.floor(Math.abs(zone) / 60)).padStart(2, '0')}:${String(Math.abs(zone) % 60).padStart(2, '0')}`;
  return [`${local}${frac}${z}`, fine ? ms : ms - (ms % 1000)];
}

/** A pod, uneven as a cluster's: its values from rnd (a twin of the one before it now and then: its key, another uid). */
function pod(i: number, rnd: () => number, version = 0, twin?: { ns: string; name: string }) {
  const containers = 1 + Math.floor(rnd() * 3);
  const ns = twin?.ns ?? NAMESPACES[Math.floor(rnd() * NAMESPACES.length)];
  const number = rnd() < 0.02 ? `${Math.floor(rnd() * 9) + 1}${'0'.repeat(39)}${i}` : `${rnd() < 0.1 ? '0' : ''}${Math.floor(rnd() * 5000)}`;
  const name = twin?.name ?? `${NAMES[i % NAMES.length]}-${number}-${i.toString(36)}`;
  const owners = Array.from({ length: Math.floor(rnd() * 3) }, () => {
    // Some owners of many (a few thousand in all, the first ones most).
    const rs = Math.floor(rnd() * rnd() * 4000);
    return { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: `rs-${rs}`, uid: `rs-${rs}` };
  });
  const ready = rnd() > 0.1;
  const [created, ms] = rfc3339(Date.UTC(2025, 0, 1) + Math.floor(rnd() * 3e10), ZONES[Math.floor(rnd() * ZONES.length)], rnd);
  const p = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      namespace: ns,
      name,
      uid: `uid-${i}-${version}`,
      resourceVersion: String(1000 + i + version),
      creationTimestamp: created,
      labels: rnd() < 0.05 ? undefined : { app: `app-${i % 997}`, 'app.kubernetes.io/name': `svc-${i % 53}`, tier: rnd() < 0.5 ? 'web' : 'db' },
      ...(owners.length ? { ownerReferences: owners } : {}),
      // Now and then a big one (a last-applied annotation).
      ...(rnd() < 0.01 ? { annotations: { 'kubectl.kubernetes.io/last-applied-configuration': 'x'.repeat(20_000) } } : {}),
    },
    spec: {
      nodeName: rnd() < 0.03 ? undefined : `node-${Math.floor(rnd() * 500)}`,
      // Mixed kinds of value: a priority a number, now and then a string, or none.
      priority: rnd() < 0.02 ? 'high' : rnd() < 0.1 ? undefined : Math.floor(rnd() * 1000),
      containers: Array.from({ length: containers }, (_, c) => ({ name: `c${c}`, image: `registry/app-${i % 997}:${c}` })),
    },
    status: {
      phase: rnd() < 0.01 ? undefined : PHASES[Math.floor(rnd() * PHASES.length)],
      conditions: [
        { type: 'Ready', status: ready ? 'True' : 'False' },
        { type: 'ContainersReady', status: ready ? 'True' : 'False' },
      ],
      containerStatuses: Array.from({ length: containers }, (_, c) => ({ name: `c${c}`, ready, restartCount: Math.floor(rnd() * rnd() * 40) })),
    },
  };
  CREATED.set(p, ms);
  return p;
}
type Pod = ReturnType<typeof pod>;

const pods = (n: number, seed = 1) => {
  const rnd = random(seed);
  const out: Pod[] = [];
  for (let i = 0; i < n; i++) {
    const before = out[i - 1];
    out.push(pod(i, rnd, 0, i % 500 === 499 && before ? { ns: before.metadata.namespace, name: before.metadata.name } : undefined));
  }
  return out;
};

const restarts = (p: Pod) => p.status.containerStatuses.reduce((n, s) => n + s.restartCount, 0);
const makeFields = (): Fields =>
  new Map([
    ['core.name', { type: 'string', value: '.metadata.name' }],
    ['core.ready', { type: 'string', value: '.status.conditions[?(@.type=="Ready")].status' }],
    ['core.owner.uid', { type: 'string', many: true, value: '.metadata.ownerReferences[*].uid' }],
    ['core.created', { type: 'time', value: '.metadata.creationTimestamp' }],
    ['pods.v1.restarts', { type: 'number', value: restarts }],
    ['pods.v1.phase', { type: 'string', value: '.status.phase' }],
  ] as const);
const fields = makeFields();

const page = { limit: 50 };
const eq = (field: string, value: string | number): Where => ({ field, op: 'eq', value });
const key = (p: Pod) => `${p.metadata.namespace}/${p.metadata.name}`;
const lower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
const owners = (p: Pod) => (p.metadata.ownerReferences ?? []).map((o) => o.uid);
const time = (p: Pod) => CREATED.get(p) as number;

/** A query, and its answer worked out apart: which, and in what order (the reference's, then key, then uid). */
interface Case {
  name: string;
  query: ListQuery;
  holds: (p: Pod) => boolean;
  by?: (p: Pod) => string | number | boolean | undefined;
  desc?: boolean;
  /** Walked by cursor, every window of it. */
  walk?: boolean;
}
const least = (vs: string[]) => [...vs].sort(reference)[0];
const greatest = (vs: string[]) => [...vs].sort(reference).at(-1);
const CASES: Case[] = [
  { name: 'no where, by key', query: { kind: 'pods.v1', page }, holds: () => true, walk: true },
  { name: 'phase = Running', query: { kind: 'pods.v1', page, where: eq('pods.v1.phase', 'Running') }, holds: (p) => p.status.phase === 'Running' },
  { name: 'not ready', query: { kind: 'pods.v1', page, where: eq('core.ready', 'False') }, holds: (p) => p.status.conditions[0].status === 'False' },
  {
    name: 'restarts 10..20 (function)',
    query: { kind: 'pods.v1', page, where: { field: 'pods.v1.restarts', op: 'range', gte: 10, lt: 20 } },
    holds: (p) => restarts(p) >= 10 && restarts(p) < 20,
  },
  { name: 'an owner (many)', query: { kind: 'pods.v1', page, where: eq('core.owner.uid', 'rs-42') }, holds: (p) => owners(p).includes('rs-42') },
  {
    name: 'not this phase (none too)',
    query: { kind: 'pods.v1', page, where: { field: 'pods.v1.phase', op: 'ne', value: 'Running' } },
    holds: (p) => p.status.phase !== 'Running',
  },
  {
    name: 'label with dots, and another',
    query: {
      kind: 'pods.v1',
      page,
      where: { op: 'and', args: [eq('.metadata.labels.tier', 'web'), eq('.metadata.labels.app\\.kubernetes\\.io/name', 'svc-3')] },
    },
    holds: (p) => p.metadata.labels?.tier === 'web' && p.metadata.labels?.['app.kubernetes.io/name'] === 'svc-3',
  },
  {
    name: 'contains (ASCII case aside)',
    query: { kind: 'pods.v1', page, where: { field: 'core.name', op: 'contains', value: 'APP-1' } },
    holds: (p) => lower(p.metadata.name).includes('app-1'),
  },
  {
    name: 'in of 1000',
    query: { kind: 'pods.v1', page, where: { field: 'core.owner.uid', op: 'in', values: Array.from({ length: 1000 }, (_, i) => `rs-${i * 4}`) } },
    holds: (p) => owners(p).some((o) => Number(o.slice(3)) % 4 === 0),
  },
  {
    name: 'or / not tree',
    query: {
      kind: 'pods.v1',
      page,
      where: {
        op: 'or',
        args: [
          eq('pods.v1.phase', 'Failed'),
          {
            op: 'and',
            args: [
              { op: 'not', arg: eq('core.ready', 'True') },
              { field: 'pods.v1.restarts', op: 'range', gt: 5 },
            ],
          },
        ],
      },
    },
    holds: (p) => p.status.phase === 'Failed' || (p.status.conditions[0].status !== 'True' && restarts(p) > 5),
  },
  {
    name: 'a range of strings',
    query: { kind: 'pods.v1', page, where: { field: 'core.name', op: 'range', gte: 'b', lt: 'w' } },
    holds: (p) => reference(p.metadata.name, 'b') >= 0 && reference(p.metadata.name, 'w') < 0,
  },
  {
    name: 'a range of times (zones apart)',
    query: { kind: 'pods.v1', page, where: { field: 'core.created', op: 'range', gte: '2025-03-01T00:00:00+05:30', lt: '2025-06-01T00:00:00-07:00' } },
    holds: (p) => time(p) >= Date.UTC(2025, 1, 28, 18, 30) && time(p) < Date.UTC(2025, 5, 1, 7),
  },
  { name: 'sort restarts desc', query: { kind: 'pods.v1', page, sort: [{ field: 'pods.v1.restarts', desc: true }] }, holds: () => true, by: restarts, desc: true, walk: true },
  { name: 'sort created (zones, out of order)', query: { kind: 'pods.v1', page, sort: [{ field: 'core.created' }] }, holds: () => true, by: time },
  { name: 'sort name (declared)', query: { kind: 'pods.v1', page, sort: [{ field: 'core.name' }] }, holds: () => true, by: (p) => p.metadata.name, walk: true },
  { name: 'sort name (a path)', query: { kind: 'pods.v1', page, sort: [{ field: '.metadata.name' }] }, holds: () => true, by: (p) => p.metadata.name },
  {
    name: 'sort mixed kinds, none there (priority)',
    query: { kind: 'pods.v1', page, sort: [{ field: '.spec.priority' }] },
    holds: () => true,
    by: (p) => p.spec.priority,
    walk: true,
  },
  { name: 'sort an owner (many: least)', query: { kind: 'pods.v1', page, sort: [{ field: 'core.owner.uid' }] }, holds: () => true, by: (p) => least(owners(p)), walk: true },
  {
    name: 'sort an owner desc (many: greatest)',
    query: { kind: 'pods.v1', page, sort: [{ field: 'core.owner.uid', desc: true }] },
    holds: () => true,
    by: (p) => greatest(owners(p)),
    desc: true,
    walk: true,
  },
  {
    name: 'page at the end, by restarts',
    query: { kind: 'pods.v1', page: { limit: 50, offset: 1e9 }, sort: [{ field: 'pods.v1.restarts' }] },
    holds: () => true,
    by: restarts,
  },
  { name: 'a window of 10 000', query: { kind: 'pods.v1', page: { limit: LIMITS.page }, sort: [{ field: 'core.created' }] }, holds: () => true, by: time },
];

/** A case's whole answer, worked out apart: those it holds, in its order (none last, either way), ties by key, then by uid. */
function oracle(objects: Pod[], c: Case): Pod[] {
  return objects
    .filter(c.holds)
    .map((p) => ({ p, v: c.by?.(p) }))
    .sort((a, b) => {
      if (a.v !== b.v) {
        if (a.v === undefined) return 1;
        if (b.v === undefined) return -1;
        const n = reference(a.v, b.v);
        if (n) return c.desc ? -n : n;
      }
      return reference(key(a.p), key(b.p)) || lexical(points(a.p.metadata.uid), points(b.p.metadata.uid));
    })
    .map((x) => x.p);
}

function shuffled<T>(xs: T[], seed: number): T[] {
  const rnd = random(seed);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const same = (items: readonly Item[], want: Pod[], what: string) => {
  const i = items.findIndex((it, i) => it.object !== want[i]);
  if (items.length !== want.length || i >= 0) throw new Error(`wrong: ${what} — at ${i}: ${items[i]?.key} vs ${want[i] && key(want[i])} (${items.length} vs ${want.length})`);
};

/** Every window of a query, by cursor or by offset: all of it, in order. */
function walk(objects: Pod[], query: ListQuery, limit: number, by: 'cursor' | 'offset'): Item[] {
  const all: Item[] = [];
  let after: string | undefined;
  for (;;) {
    const q = { ...query, page: by === 'cursor' ? { limit, ...(after ? { after } : {}) } : { limit, offset: all.length } };
    const wrong = checkQuery(q, fields, 'list');
    if (wrong) throw new Error(`a window refused: ${wrong.message}`);
    const r = scan(objects, q, fields);
    all.push(...r.items);
    if (!r.next) return all;
    after = r.next;
  }
}

const ms = (t: number) => `${t.toFixed(1)}`;
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const heap = () => {
  gc?.();
  gc?.();
  return process.memoryUsage().heapUsed;
};
function timed(fn: () => unknown): number {
  const t = performance.now();
  fn();
  return performance.now() - t;
}
/** The median of 5 runs and the slowest, warmed up first. */
function median(fn: () => unknown): string {
  fn();
  const runs = Array.from({ length: 5 }, () => timed(fn)).sort((a, b) => a - b);
  return `${ms(runs[2])} (max ${ms(runs[4])})`;
}
const say = (...cells: (string | number)[]) => console.log(cells.join(' | '));

/** Memory, in a process of its own: its line, or the run fails. */
async function memory(what: string, n: number): Promise<void> {
  const { spawnSync } = await import('node:child_process');
  const out = spawnSync(process.execPath, [...process.execArgv, new URL(import.meta.url).pathname, `mem:${what}`, String(n)], { encoding: 'utf8' });
  if (out.status !== 0)
    throw new Error(`memory ${what} of ${n}: ${out.signal ? `killed (${out.signal}): not memory enough beside this run` : out.stderr.trim().split('\n').at(-1)}`);
  say(n, `memory: ${what}`, out.stdout.trim());
}

function memoryRun(what: string, n: number) {
  const objects = pods(n);
  const base = heap();
  if (what === 'fields') {
    for (const c of CASES) scan(objects, c.query, fields);
    for (const by of ['pods.v1.phase', 'core.owner.uid']) scanCount(objects, { kind: 'pods.v1', groupBy: by }, fields);
    const kept = heap() - base;
    console.log(`kept of 6 fields: ${mb(kept)}, ${(kept / n).toFixed(0)} B a pod (the pods: ${mb(base)})`);
  } else if (what === 'search') {
    // A path typed into a search, one character at a time, each asked of them all.
    const path = '.metadata.labels.app';
    for (let i = 2; i <= path.length; i++) scan(objects, { kind: 'pods.v1', page, where: { field: path.slice(0, i), op: 'exists' } }, fields);
    const one = heap() - base;
    for (let k = 0; k < 20; k++) scan(objects, { kind: 'pods.v1', page, where: { field: `.metadata.labels.k${k}`, op: 'exists' } }, fields);
    const more = heap() - base;
    if (more > one * 1.2 + 1e6) throw new Error(`a search's paths kept: ${mb(one)} then ${mb(more)}`);
    console.log(`kept after a path typed: ${mb(one)}; after 20 more: ${mb(more)}`);
  } else if (what === 'redefined') {
    // Fields defined again and again (an addon reloaded): each map's own kept while it is, the last one's only after.
    for (let k = 0; k < 20; k++) scan(objects, CASES[12].query, makeFields());
    console.log(`kept after 20 maps of fields: ${mb(heap() - base)}`);
  }
}

async function main() {
  for (const n of SIZES) {
    const objects = pods(n);
    const mixed = shuffled(objects, n);
    for (const c of CASES) {
      const wrong = checkQuery(c.query, fields, 'list');
      if (wrong) throw new Error(`${c.name} refused: ${wrong.message}`);
      const want = oracle(objects, c);
      const offset = c.query.page.offset ?? 0;
      const got = scan(objects, c.query, fields);
      same(got.items, want.slice(offset, offset + c.query.page.limit), c.name);
      if (got.total?.count !== want.length) throw new Error(`wrong total: ${c.name}`);
      // All of it, its objects in another order: the same, every one of them in its place.
      same(scan(mixed, { ...c.query, page: { limit: n } }, fields).items, want, `${c.name}, all of it, its objects shuffled`);
      if (c.walk && n <= 10_000) same(walk(objects, c.query, 1000, 'cursor'), want, `${c.name}, walked by cursor`);
      const fresh = pods(n, 2);
      const cold = timed(() => scan(fresh, c.query, makeFields()));
      say(n, c.name, `cold ${ms(cold)}`, `warm ${median(() => scan(objects, c.query, fields))}`, `found ${want.length}`);
    }

    // A whole answer walked: by cursor and by offset, the same as all of it.
    if (n <= 100_000) {
      const c = CASES[14];
      const want = oracle(objects, c);
      for (const by of ['cursor', 'offset'] as const) {
        let all: Item[] = [];
        const t = timed(() => {
          all = walk(objects, c.query, 1000, by);
        });
        same(all, want, `walked by ${by}`);
        say(n, `walk all by ${by}, 1000 a window`, `${ms(t)} in all`);
      }
    }

    for (const [name, q, of] of [
      ['count by phase', { kind: 'pods.v1', groupBy: 'pods.v1.phase' }, (p: Pod) => [p.status.phase]],
      ['count by owner (many, ~4000), top 20', { kind: 'pods.v1', groupBy: 'core.owner.uid', top: 20 }, (p: Pod) => [...new Set(owners(p))]],
      [
        'count not ready by namespace',
        { kind: 'pods.v1', where: eq('core.ready', 'False'), groupBy: '.metadata.namespace' },
        (p: Pod) => (p.status.conditions[0].status === 'False' ? [p.metadata.namespace] : undefined),
      ],
    ] as const) {
      const got = scanCount(objects, q, fields);
      // The groups worked out apart: the most first, ties in the reference's order, none last; past top, the rest summed.
      const counts = new Map<string | null, number>();
      let total = 0;
      for (const p of objects) {
        const vs = of(p);
        if (!vs) continue;
        total++;
        const present = vs.filter((v) => v !== undefined) as string[];
        for (const v of present.length ? present : [null]) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const all = [...counts].map(([value, count]) => ({ value, count }));
      all.sort((a, b) => b.count - a.count || (a.value === null ? 1 : b.value === null ? -1 : reference(a.value, b.value)));
      const top = 'top' in q ? q.top : undefined;
      const want = {
        total: { count: total, exact: true },
        groups: top === undefined ? all : all.slice(0, top),
        ...(top !== undefined && all.length > top ? { rest: all.slice(top).reduce((s, g) => s + g.count, 0) } : {}),
      };
      if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`wrong groups: ${name}`);
      say(n, name, `warm ${median(() => scanCount(objects, q, fields))}`, `groups ${got.groups?.length}${got.rest ? ` (+${got.rest} in the rest)` : ''}`);
    }

    // A watch's churn: 1% of them new versions, their values changed, the same query again — 10 times over.
    const churned = [...objects];
    const rnd = random(7);
    const c = CASES[12];
    const times: number[] = [];
    for (let round = 0; round < 10; round++) {
      for (let i = round; i < n; i += 100) churned[i] = pod(i, rnd, round + 1);
      times.push(timed(() => scan(churned, c.query, fields)));
    }
    same(scan(churned, c.query, fields).items, oracle(churned, c).slice(0, 50), 'after churn');
    times.sort((a, b) => a - b);
    say(n, '1% changed, sort restarts again (x10)', `median ${ms(times[5])} (max ${ms(times[9])})`);

    for (const what of ['fields', 'search', 'redefined']) await memory(what, n);
  }

  // matches, as a caller has it one object at a time (a predicate made each time).
  {
    const objects = pods(10_000);
    say(10_000, 'matches one by one (made each time)', `warm ${median(() => objects.filter((o) => matches(o, CASES[9].query.where, fields)))}`);
  }

  // checkQuery of the worst: as deep, as big as allowed and past it — each answered as it should be.
  {
    const deep = (d: number): Where => {
      let w = eq('.a', 1);
      for (let i = 0; i < d; i++) w = { op: 'not', arg: w };
      return w;
    };
    const many = (n: number) => Array.from({ length: n }, () => ({ field: '.a' }));
    for (const [name, query, want] of [
      ['deepest allowed', { kind: 'pods.v1', page, where: deep(LIMITS.depth - 1) }, undefined],
      ['too deep (10 000)', { kind: 'pods.v1', page, where: deep(10_000) }, 'too_deep'],
      ['too big', { kind: 'pods.v1', page, where: { op: 'or', args: Array.from({ length: LIMITS.nodes + 5 }, () => eq('.a', 1)) } }, 'too_big'],
      ['a sort of 100 000 fields', { kind: 'pods.v1', page, sort: many(100_000) }, 'too_big'],
      ['a path of 1 MB', { kind: 'pods.v1', page, sort: [{ field: `.${'a'.repeat(1 << 20)}` }] }, 'bad_field'],
      ['ins of 1 000 000 values', { kind: 'pods.v1', page, where: { field: '.a', op: 'in', values: Array.from({ length: 1e6 }, (_, i) => i) } }, 'too_big'],
    ] as const) {
      let r: { code: string } | undefined;
      const t = timed(() => {
        r = checkQuery(query, fields, 'list');
      });
      if (r?.code !== want) throw new Error(`checkQuery, ${name}: ${r?.code ?? 'ok'}, not ${want ?? 'ok'}`);
      say('-', `checkQuery, ${name}`, ms(t), r?.code ?? 'ok');
    }
  }

  say('-', 'a path over 1 000 000 elements', ms(timed(() => valuesAt({ a: Array.from({ length: 1e6 }, (_, i) => i) }, '.a[*]'))));
}

if (process.argv[2]?.startsWith('mem:')) memoryRun(process.argv[2].slice(4), Number(process.argv[3]));
else await main();
