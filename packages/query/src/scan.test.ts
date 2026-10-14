import { describe, expect, it } from 'vitest';
import { checkQuery, compare, type Fields, LIMITS, type ListQuery, scan, scanCount, valuesOf, type Where } from './index.ts';

const pod = (ns: string, name: string, phase: string, restarts: number, created: string, owners: string[] = [], labels: Record<string, string> = {}) => ({
  metadata: { namespace: ns, name, uid: `${ns}.${name}`, creationTimestamp: created, labels, ownerReferences: owners.map((uid) => ({ uid })) },
  status: { phase, restarts },
});
type Pod = ReturnType<typeof pod>;

const pods = [
  pod('shop', 'web-2', 'Running', 0, '2026-10-01T10:00:00Z', ['rs1'], { app: 'web' }),
  pod('shop', 'web-10', 'Running', 4, '2026-10-02T12:00:00+02:00', ['rs1'], { app: 'web' }),
  pod('shop', 'db-0', 'Pending', 1, '2026-09-30T10:00:00Z', ['ss1', 'x'], { app: 'db' }),
  pod('kube-system', 'dns', 'Failed', 9, '2026-10-03T10:00:00Z'),
  { metadata: { namespace: 'shop', name: 'web-1', uid: 'shop.web-1' }, status: {} } as Pod,
];

const fields: Fields = new Map([
  ['core.restarts', { type: 'number', value: (p: Pod) => p.status.restarts }],
  ['core.created', { type: 'time', value: '.metadata.creationTimestamp' }],
  ['core.owner.uid', { type: 'string', many: true, value: '.metadata.ownerReferences[*].uid' }],
  [
    'core.boom',
    {
      type: 'string',
      value: () => {
        throw new Error('no luck');
      },
    },
  ],
  ['pod.phase', { kinds: ['pods.v1'], type: 'string', value: '.status.phase' }],
  ['.status.phase', { kinds: ['pods.v1'], type: 'string', value: '.status.phase' }],
  ['__proto__', { type: 'string', many: true, value: '.metadata.labels.app' }],
] as const);

const page = { limit: 50 };
const list = (rest: Partial<ListQuery> = {}) => scan(pods, { kind: 'pods.v1', page, ...rest }, fields);
const names = (where?: Where, rest: Partial<ListQuery> = {}) => list({ where, ...rest }).items.map((i) => (i.object as Pod).metadata.name);
const eq = (field: string, value: string | number | boolean): Where => ({ field, op: 'eq', value });
/** Every window of a query, one cursor after another. */
const walk = <O>(objects: O[], query: Omit<ListQuery, 'page'>, limit: number, f = fields) => {
  const keys: string[] = [];
  let after: string | undefined;
  for (;;) {
    const r = scan(objects, { ...query, page: { limit, ...(after ? { after } : {}) } }, f);
    keys.push(...r.items.map((i) => `${i.key}#${i.uid}`));
    if (!r.next) return keys;
    after = r.next;
  }
};

describe('a scan', () => {
  it('orders by key when no sort is asked (numbers in names as numbers)', () => {
    expect(names()).toEqual(['dns', 'db-0', 'web-1', 'web-2', 'web-10']);
  });

  it('orders by a field, either way: no value last, ties by key', () => {
    expect(names(undefined, { sort: [{ field: 'core.restarts', desc: true }] })).toEqual(['dns', 'web-10', 'db-0', 'web-2', 'web-1']);
    expect(names(undefined, { sort: [{ field: 'core.restarts' }] })).toEqual(['web-2', 'db-0', 'web-10', 'dns', 'web-1']);
  });

  it.each<[string, Where, string[]]>([
    ['a value', eq('.status.phase', 'Running'), ['web-2', 'web-10']],
    ['none of a value (none there too)', { field: '.status.phase', op: 'ne', value: 'Running' }, ['dns', 'db-0', 'web-1']],
    ['one of these', { field: '.status.phase', op: 'in', values: ['Pending', 'Failed'] }, ['dns', 'db-0']],
    ['there', { field: '.metadata.labels.app', op: 'exists' }, ['db-0', 'web-2', 'web-10']],
    ['not there', { op: 'not', arg: { field: '.status.phase', op: 'exists' } }, ['web-1']],
    ['a range of times, in any zone', { field: 'core.created', op: 'range', gt: '2026-10-01T12:00:00Z', lt: '2026-10-03T00:00:00+02:00' }, ['web-10']],
    ['a range of numbers', { field: 'core.restarts', op: 'range', gte: 1, lt: 9 }, ['db-0', 'web-10']],
    ['words in it, ASCII case aside', { field: '.metadata.name', op: 'contains', value: 'WEB-1' }, ['web-1', 'web-10']],
    ['words in a number: none (a string’s only)', { field: '.status.restarts', op: 'contains', value: '4' }, []],
    ['one of a many field’s values', eq('core.owner.uid', 'x'), ['db-0']],
    ['all of them', { op: 'and', args: [eq('.metadata.namespace', 'shop'), eq('.status.phase', 'Running')] }, ['web-2', 'web-10']],
    ['any of these', { op: 'or', args: [eq('.status.phase', 'Failed'), eq('.metadata.labels.app', 'db')] }, ['dns', 'db-0']],
    ['all of none: every one', { op: 'and', args: [] }, ['dns', 'db-0', 'web-1', 'web-2', 'web-10']],
    ['any of none: no one', { op: 'or', args: [] }, []],
    ['a field whose function throws: none there', { op: 'not', arg: { field: 'core.boom', op: 'exists' } }, ['dns', 'db-0', 'web-1', 'web-2', 'web-10']],
    ['a literal not of its field’s type: none', eq('core.restarts', '0x0'), []],
  ])('finds by %s', (_, where, found) => {
    expect(names(where)).toEqual(found);
  });

  it('holds a many field’s range to one of its values: every bound on it', () => {
    const fields: Fields = new Map([['n', { type: 'number', many: true, value: '.n[*]' }]]);
    const found = scan([{ metadata: { name: 'a' }, n: [1, 10] }], { kind: 'x', page, where: { field: 'n', op: 'range', gt: 5, lt: 7 } }, fields);
    expect(found.total).toEqual({ count: 0, exact: true });
  });

  it('gives a window, how many in all, and where the next starts: past the last, whatever came since', () => {
    const first = list({ page: { limit: 2 } });
    expect([first.items.map((i) => i.key), first.total]).toEqual([['kube-system/dns', 'shop/db-0'], { count: 5, exact: true }]);
    const more = [pod('kube-system', 'a', 'Running', 0, '2026-10-01T10:00:00Z'), ...pods];
    const next = scan(more, { kind: 'pods.v1', page: { limit: 2, after: first.next } }, fields);
    expect([next.items.map((i) => i.key), next.next !== undefined]).toEqual([['shop/web-1', 'shop/web-2'], true]);
    expect(list({ page: { limit: 2, offset: 3 } }).next).toBeUndefined();
  });

  it('walks it all by cursor, whatever its sort: desc, a many field (its least, its greatest), none there, kinds mixed', () => {
    const objects = [3, 'b', true, undefined, 10, 'a10', 'a2', [5, 1], [2, 9], [], 3].map((v, i) => ({ metadata: { name: `o${i}`, uid: `u${i}` }, v }));
    for (const sort of [[{ field: '.v[*]' }], [{ field: '.v[*]', desc: true }], [{ field: '.v[*]' }, { field: '.metadata.name', desc: true }]]) {
      const all = scan(objects, { kind: 'x', page: { limit: 100 }, sort }, fields).items.map((i) => `${i.key}#${i.uid}`);
      for (const limit of [1, 2, 3]) expect(walk(objects, { kind: 'x', sort }, limit)).toEqual(all);
    }
  });

  it('orders objects of one key by uid: the same in any order, none lost by a cursor', () => {
    const twins = ['c', 'a', 'b'].map((uid) => ({ metadata: { namespace: 'n', name: 'same', uid } }));
    expect(walk(twins, { kind: 'x' }, 1)).toEqual(['n/same#a', 'n/same#b', 'n/same#c']);
    expect(walk([...twins].reverse(), { kind: 'x' }, 1)).toEqual(['n/same#a', 'n/same#b', 'n/same#c']);
  });

  it('gives the fields selected, not the object: a many field’s and a path’s all, none as null, its own keys only', () => {
    const [item] = list({ where: eq('.metadata.name', 'db-0'), select: ['core.restarts', 'core.owner.uid', 'core.boom', '.metadata.name', '.nope', '__proto__'] }).items;
    expect(item.key).toBe('shop/db-0');
    expect({ ...item.values }).toEqual({ 'core.restarts': 1, 'core.owner.uid': ['ss1', 'x'], 'core.boom': null, '.metadata.name': ['db-0'], '.nope': null, ['__proto__']: ['db'] });
    expect(Object.keys(item.values ?? {})).toContain('__proto__');
  });

  it('answers the same whatever order the objects come in', () => {
    const tied = ['x-1', 'x-01', 'x-001', 'X-1', 'x-10', 'x-2'].map((name) => ({ metadata: { name } }));
    const order = (objects: typeof tied) => scan(objects, { kind: 'x', page }, fields).items.map((i) => i.key);
    expect(order(tied)).toEqual(order([...tied].reverse()));
    expect(order(tied)).toEqual(['X-1', 'x-001', 'x-01', 'x-1', 'x-2', 'x-10']);
  });

  it('counts by a field’s values, the most first: each kept as it is, prototype names too, none apart, past top the rest', () => {
    const odd = ['__proto__', 'constructor', 'constructor', '1', 1, true, 'true', ''].map((v, i) => ({ metadata: { name: `o${i}` }, v }));
    const { groups } = scanCount([...odd, { metadata: { name: 'none' } }], { kind: 'x', groupBy: '.v' }, fields);
    expect(groups).toEqual([
      { value: 'constructor', count: 2 },
      { value: true, count: 1 },
      { value: 1, count: 1 },
      { value: '', count: 1 },
      { value: '1', count: 1 },
      { value: '__proto__', count: 1 },
      { value: 'true', count: 1 },
      { value: null, count: 1 },
    ]);
    expect(scanCount(pods, { kind: 'pods.v1', groupBy: 'core.owner.uid', top: 1 }, fields)).toEqual({
      total: { count: 5, exact: true },
      groups: [{ value: 'rs1', count: 2 }],
      rest: 4,
    });
    expect(scanCount(pods, { kind: 'pods.v1' }, fields)).toEqual({ total: { count: 5, exact: true } });
  });

  it('works a field out anew when its map is changed: one defined again, one added', () => {
    const mine = new Map<string, Fields extends ReadonlyMap<string, infer S> ? S : never>([['f', { type: 'string', value: '.a' }]]);
    const o = { metadata: { name: 'o' }, a: 'one', b: 'two' };
    expect(valuesOf(o, 'f', mine)).toEqual(['one']);
    mine.set('f', { type: 'string', value: '.b' });
    mine.set('g', { type: 'string', value: '.a' });
    expect([valuesOf(o, 'f', mine), scan([o], { kind: 'x', page, where: eq('g', 'one') }, mine).total?.count]).toEqual([['two'], 1]);
  });
});

describe('a value', () => {
  const of = (type: 'time' | 'number', v: unknown) => valuesOf({ v }, 'v', new Map([['v', { type, value: '.v' }]]));
  const utc = (y: number, ms = 0) => {
    const d = new Date(0);
    d.setUTCFullYear(y, 0, 1);
    return d.getTime() + ms;
  };
  it.each<[string, 'time' | 'number', unknown, unknown[]]>([
    ['a time of a year before 100', 'time', '0099-01-01T00:00:00Z', [utc(99)]],
    ['a time finer than ms: cut off', 'time', '2026-01-01T00:00:00.999999999Z', [utc(2026, 999)]],
    ['a time of its zone', 'time', '2026-01-01T02:00:00+02:00', [utc(2026)]],
    ['no time: a zone past 23:59', 'time', '2026-01-01T00:00:00+99:99', []],
    ['no time: a zone of 60 minutes', 'time', '2026-01-01T00:00:00+02:60', []],
    ['no time: a t, not a T', 'time', '2026-01-01t00:00:00Z', []],
    ['no time: no such day', 'time', '2026-02-30T00:00:00Z', []],
    ['no number: past a double', 'number', '9'.repeat(400), []],
    ['no number: not decimal', 'number', '0x10', []],
  ])('%s', (_, type, v, want) => {
    expect(of(type, v)).toEqual(want);
  });
});

describe('the model’s order', () => {
  it('is natural, ASCII case aside, then by code point; kinds apart', () => {
    const values = ['b', 'a10', 'a2', 'A2', 'a02', 'ä', 'z', 3, 1, true, false];
    expect([...values].sort(compare)).toEqual([false, true, 1, 3, 'A2', 'a02', 'a2', 'a10', 'b', 'z', 'ä']);
  });

  it('has a number of any length after a shorter one: 33 digits before 59', () => {
    expect(compare('1'.repeat(33), '1'.repeat(59))).toBeLessThan(0);
    expect(compare(`A${'1'.repeat(40)}`, `a${'2'.repeat(9)}`)).toBeGreaterThan(0);
  });

  it('has a number before any character but U+0000, a U+0001 of its own too', () => {
    expect(['a\u0001z', 'a2', 'a\u0001', 'a1', 'a\u0000'].sort(compare)).toEqual(['a\u0000', 'a1', 'a2', 'a\u0001', 'a\u0001z']);
  });

  it('has a lone surrogate as Go reads it of JSON: U+FFFD', () => {
    expect(compare('\ud800', '\ufffd')).toBe(0);
    expect(scan([{ metadata: { name: 'o' }, v: '\ud800' }], { kind: 'x', page, where: eq('.v', '\ufffd') }, fields).total?.count).toBe(1);
  });

  it('has characters by code point, as UTF-8 has them: one past U+FFFF after U+FF01', () => {
    expect(['😀', '！', 'a'].sort(compare)).toEqual(['a', '！', '😀']);
  });
});

describe('a query checked', () => {
  const deep = (n: number): Where => (n ? { op: 'not', arg: deep(n - 1) } : eq('.a', 1));
  const first = list({ page: { limit: 1 } }).next;
  it.each<[string, unknown, 'get' | 'list' | 'count', string, string]>([
    ['no such field', { kind: 'pods.v1', page, where: eq('nope', 1) }, 'list', 'unknown_field', 'no field nope'],
    ['a value not of its type', { kind: 'pods.v1', page, where: eq('core.restarts', 'many') }, 'list', 'bad_value', '"many" is not a number (core.restarts)'],
    ['a number for a string field', { kind: 'pods.v1', page, where: eq('pod.phase', 1) }, 'list', 'bad_value', '1 is not a string (pod.phase)'],
    [
      'a time without its zone',
      { kind: 'pods.v1', page, where: { field: 'core.created', op: 'range', gt: '2026-10-01T10:00:00' } },
      'list',
      'bad_value',
      '"2026-10-01T10:00:00" is not a time (core.created)',
    ],
    ['a number past a double', { kind: 'pods.v1', page, where: eq('core.restarts', '9'.repeat(400)) }, 'list', 'bad_value', `"${'9'.repeat(400)}" is not a number (core.restarts)`],
    [
      'deep in an or',
      { kind: 'pods.v1', page, where: { op: 'or', args: [{ field: 'core.restarts', op: 'in', values: [1, 'x'] }] } },
      'list',
      'bad_value',
      '"x" is not a number (core.restarts)',
    ],
    ['words not text', { kind: 'pods.v1', page, where: { field: '.a', op: 'contains', value: 5 } }, 'list', 'bad_where', 'contains is { field, op, value: words }'],
    [
      'words in a number',
      { kind: 'pods.v1', page, where: { field: 'core.restarts', op: 'contains', value: '1' } },
      'list',
      'bad_where',
      'contains is of a string field, not a number (core.restarts)',
    ],
    ['in not a list', { kind: 'pods.v1', page, where: { field: '.a', op: 'in', values: null } }, 'list', 'bad_where', 'in is { field, op, values: [...] }'],
    [
      'ins of more values than in all',
      { kind: 'pods.v1', page, where: { op: 'and', args: [1, 2].map(() => ({ field: '.a', op: 'in', values: Array.from({ length: LIMITS.values / 2 + 1 }, (_, i) => i) })) } },
      'list',
      'too_big',
      `a where's ins hold at most ${LIMITS.values} values`,
    ],
    ['a test it has not', { kind: 'pods.v1', page, where: { field: '.a', op: 'gtee', value: 5 } }, 'list', 'bad_where', 'no test "gtee"'],
    [
      'a range with no bound',
      { kind: 'pods.v1', page, where: { field: '.a', op: 'range' } },
      'list',
      'bad_where',
      'range is { field, op, gt?, gte?, lt?, lte? }, a bound at least',
    ],
    ['a range of two kinds', { kind: 'pods.v1', page, where: { field: '.a', op: 'range', gte: 1, lte: 'z' } }, 'list', 'bad_where', "a range's bounds are of one kind (.a)"],
    ['a part too many', { kind: 'pods.v1', page, where: { op: 'and', args: [], '.a': 1 } }, 'list', 'bad_where', 'and is { op, args: [...] }'],
    ['too deep', { kind: 'pods.v1', page, where: deep(LIMITS.depth) }, 'list', 'too_deep', `a where is at most ${LIMITS.depth} deep`],
    [
      'too big',
      { kind: 'pods.v1', page, where: { op: 'or', args: Array.from({ length: LIMITS.nodes }, () => eq('.a', 1)) } },
      'list',
      'too_big',
      `a where holds at most ${LIMITS.nodes} parts`,
    ],
    ['a path that is none', { kind: 'pods.v1', page, sort: [{ field: '.a[' }] }, 'list', 'bad_path', 'an array not closed at 2 of .a['],
    ['a path too long', { kind: 'pods.v1', page, sort: [{ field: `.${'a'.repeat(LIMITS.text)}` }] }, 'list', 'bad_field', `".${'a'.repeat(62)} is not a field's name`],
    [
      'a sort of too many fields',
      { kind: 'pods.v1', page, sort: Array.from({ length: LIMITS.sort + 1 }, () => ({ field: '.a' })) },
      'list',
      'too_big',
      `a sort is by at most ${LIMITS.sort} fields`,
    ],
    [
      'a select of too many fields',
      { kind: 'pods.v1', page, select: Array.from({ length: LIMITS.select + 1 }, () => '.a') },
      'list',
      'too_big',
      `a select is of at most ${LIMITS.select} fields`,
    ],
    [
      'a scope of too many namespaces',
      { kind: 'pods.v1', page, scope: { namespaces: Array.from({ length: LIMITS.namespaces + 1 }, (_, i) => `n${i}`) } },
      'list',
      'too_big',
      `a scope holds at most ${LIMITS.namespaces} namespaces`,
    ],
    ['a field of other kinds', { kind: 'nodes.v1', groupBy: 'pod.phase' }, 'count', 'not_for_kind', 'pod.phase is not a field of nodes.v1'],
    ['a field of other kinds, named as a path', { kind: 'nodes.v1', groupBy: '.status.phase' }, 'count', 'not_for_kind', '.status.phase is not a field of nodes.v1'],
    ['a field selected that is none', { kind: 'pods.v1', page, select: ['nope'] }, 'list', 'unknown_field', 'no field nope'],
    ['a list with no window', { kind: 'pods.v1' }, 'list', 'bad_page', `a page has a limit, 1 to ${LIMITS.page}`],
    ['too big a window', { kind: 'pods.v1', page: { limit: LIMITS.page + 1 } }, 'list', 'bad_page', `a page has a limit, 1 to ${LIMITS.page}`],
    ['an offset and a cursor', { kind: 'pods.v1', page: { limit: 5, offset: 1, after: first } }, 'list', 'bad_page', 'a page starts at an offset or after a cursor, not both'],
    ['a cursor that is none', { kind: 'pods.v1', page: { limit: 5, after: 'x' } }, 'list', 'bad_cursor', 'not a cursor of this query'],
    ['a cursor of another sort', { kind: 'pods.v1', page: { limit: 5, after: first }, sort: [{ field: 'core.created' }] }, 'list', 'bad_cursor', 'not a cursor of this query'],
    ['a cursor of another where', { kind: 'pods.v1', page: { limit: 5, after: first }, where: eq('.a', 1) }, 'list', 'bad_cursor', 'not a cursor of this query'],
    ['a scope that is none', { kind: 'pods.v1', page, scope: 'shop' }, 'list', 'bad_scope', "a scope is 'all' or { namespaces: [...] }"],
    ['a part it has not', { kind: 'pods.v1', page, filter: 1 }, 'list', 'bad_query', 'a list query has no filter'],
    ['a count with a window', { kind: 'pods.v1', page }, 'count', 'bad_query', 'a count query has no page'],
    ['a get with no name', { kind: 'pods.v1', namespace: 'shop' }, 'get', 'bad_query', 'a get query is { kind, namespace?, name }'],
    ['not a query', 'pods', 'list', 'bad_query', 'a query is an object with its kind'],
  ])('says why it is not one: %s', (_, query, as, code, message) => {
    expect(checkQuery(query, fields, as)).toEqual({ code, message });
  });

  it('says nothing of one that is', () => {
    const where: Where = { op: 'and', args: [{ field: 'core.restarts', op: 'range', gte: 1 }, eq('.anything.at.all', 'x'), deep(LIMITS.depth - 2)] };
    const sort = [{ field: 'core.created' }];
    const after = scan(pods, { kind: 'pods.v1', page: { limit: 1 }, where, sort }, fields).next;
    expect(checkQuery({ kind: 'pods.v1', page: { limit: 5, after }, where, sort }, fields, 'list')).toBeUndefined();
    expect(checkQuery({ kind: 'pods.v1', namespace: 'shop', name: 'web-1' }, fields, 'get')).toBeUndefined();
  });

  it('takes a cursor of the same query, said another way: desc false, all its scope, its namespaces in another order', () => {
    const at = (q: Partial<ListQuery>) => scan(pods, { kind: 'pods.v1', page: { limit: 1 }, ...q }, fields).next;
    const ok = (q: Partial<ListQuery>, after?: string) => checkQuery({ kind: 'pods.v1', page: { limit: 1, after }, ...q }, fields, 'list');
    expect(ok({ sort: [{ field: 'core.restarts', desc: false }] }, at({ sort: [{ field: 'core.restarts' }] }))).toBeUndefined();
    expect(ok({ scope: 'all' }, at({}))).toBeUndefined();
    expect(ok({ scope: { namespaces: ['shop', 'kube-system', 'shop'] } }, at({ scope: { namespaces: ['kube-system', 'shop'] } }))).toBeUndefined();
  });

  it('takes no cursor of another query to scan: it says so', () => {
    expect(() => list({ page: { limit: 5, after: first }, sort: [{ field: 'core.created' }] })).toThrow('not a cursor of this query');
  });
});
