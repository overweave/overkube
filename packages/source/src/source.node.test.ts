import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Layer } from '@overkube/cel';
import { type Connector, createConnector } from '@overkube/connector';
import { FakeKube, kindOf } from '@overkube/fake-kube';
import { createGateway, fromKubeconfig, type Gateway, resetWatchState } from '@overkube/gateway';
import type { KubeObject } from '@overkube/kube-types';
import type { Live, LogResult } from '@overkube/query';
import { signal } from '@preact/signals';
import { afterEach, describe, expect, it } from 'vitest';
import { createSource, type SourceOptions } from './source.ts';

/*
 * Queries answered from the cluster as the page watches it — the real
 * connector and gateway over a fake API server: planned onto the fewest
 * feeds, as the user is allowed; live as the objects change; let go of
 * when no longer read.
 */

const Pod = kindOf('', 'v1', 'Pod', 'pods');
const Namespace = kindOf('', 'v1', 'Namespace', 'namespaces', false);
const Node = kindOf('', 'v1', 'Node', 'nodes', false);
const CRD = kindOf('apiextensions.k8s.io', 'v1', 'CustomResourceDefinition', 'customresourcedefinitions', false);
const APIService = kindOf('apiregistration.k8s.io', 'v1', 'APIService', 'apiservices', false);
const Thing = kindOf('example.com', 'v1', 'Thing', 'things');

const opened: { kube: FakeKube; gateway: Gateway; server: Server; connector: Connector; offs: (() => void)[] }[] = [];
afterEach(async () => {
  for (const { kube, gateway, server, connector, offs } of opened.splice(0)) {
    for (const off of offs) off();
    connector.close();
    gateway.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await kube.close();
  }
  resetWatchState();
});

const pod = (name: string, namespace: string, phase = 'Running', restarts = 0) =>
  ({ metadata: { name, namespace, uid: `${namespace}-${name}` }, status: { phase, containerStatuses: [{ name: 'c', ready: true, restartCount: restarts }] } }) as KubeObject;

const thingsCrd = (columns: { name: string; type: string; jsonPath: string }[]) =>
  ({
    metadata: { name: 'things.example.com' },
    spec: { group: 'example.com', names: { plural: 'things' }, versions: [{ name: 'v1', served: true, additionalPrinterColumns: columns }] },
  }) as unknown as KubeObject;

async function until(ok: () => boolean): Promise<void> {
  for (let i = 0; i < 300 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(ok()).toBe(true);
}

/** A fake API server with these objects, the gateway, a connector, a source over it; read() keeps a query read (subscribed). */
async function setup(objects: [ReturnType<typeof kindOf>, KubeObject][] = [], options: SourceOptions = {}, lingerMs = 30, forbidden: string[] = []) {
  const kube = new FakeKube([Pod, Namespace, Node, CRD, APIService, Thing]);
  for (const [kind, o] of objects) kube.put(kind, o);
  for (const path of forbidden) kube.forbidden.add(path);
  const gateway = createGateway({ upstream: fromKubeconfig(await kube.listen()), stream: { retryMs: 20 } });
  const server = createServer((req, res) => {
    if (!gateway.handle(req, res)) res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const connector = createConnector({ http: { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }, stream: { debounceMs: 5 }, feeds: { lingerMs } });
  const offs: (() => void)[] = [];
  opened.push({ kube, gateway, server, connector, offs });
  const source = createSource(connector, options);
  const read = <T>(live: Live<T>): Live<T> => {
    offs.push(live.subscribe(() => {}));
    return live;
  };
  /** The collections asked of the API server (lists and watches), without their queries. */
  const asked = () => new Set(kube.requests.map((r) => r.split(' ')[1].split('?')[0]).filter((p) => p.includes('/pods') || p.includes('/things')));
  return { kube, connector, source, read, offs, asked };
}

const spread = (n: number) => Array.from({ length: n }, (_, i) => [Pod, pod(`p${i}`, ['a', 'b', 'c'][i % 3], i % 4 ? 'Running' : 'Pending', i % 5)] as [typeof Pod, KubeObject]);
const namespaces = ['a', 'b', 'c'].map((name) => [Namespace, { metadata: { name } } as KubeObject] as [typeof Pod, KubeObject]);

describe('a list', () => {
  it('is a window of the objects that hold, in order, their fields selected — live as they change', async () => {
    const { kube, source, read } = await setup(spread(30));
    const list = read(
      source.list({
        kind: 'pods.v1',
        where: { field: 'pods.v1.phase', op: 'eq', value: 'Pending' },
        sort: [{ field: 'pods.v1.restarts', desc: true }, { field: 'core.name' }],
        page: { limit: 2 },
        select: ['core.name', 'pods.v1.restarts'],
      }),
    );
    await until(() => list.value.state === 'live');
    expect(list.value).toMatchObject({
      coverage: { namespaces: 'all', denied: [] },
      total: { count: 8, exact: true },
      items: [{ values: { 'core.name': 'p4', 'pods.v1.restarts': 4 } }, { values: { 'core.name': 'p24', 'pods.v1.restarts': 4 } }],
    });
    kube.put(Pod, pod('top', 'b', 'Pending', 9));
    await until(() => list.value.items[0]?.values?.['core.name'] === 'top');
    expect(list.value.total?.count).toBe(9);
  });

  it('is an error when it asks what cannot be (a field none has), or of a kind the cluster does not serve', async () => {
    const { source, read } = await setup();
    const bad = read(source.list({ kind: 'pods.v1', where: { field: 'nope', op: 'exists' }, page: { limit: 1 } }));
    const absent = read(source.list({ kind: 'widgets.v1.nowhere.io', page: { limit: 1 } }));
    await until(() => bad.value.state === 'error' && absent.value.state === 'error');
    expect([bad.value.error?.code, absent.value.error?.code]).toEqual(['unknown_field', 'not_served']);
  });

  it('filters by CEL, the rest worked out of each object — live as they change; a filter that is none, before anything is asked', async () => {
    const { kube, source, read, asked } = await setup(spread(12));
    const list = read(
      source.list({ kind: 'pods.v1', filter: 'phase = Pending or self.metadata.name.endsWith("1")', sort: [{ field: 'core.name' }], page: { limit: 10 }, select: ['core.name'] }),
    );
    const count = read(source.count({ kind: 'pods.v1', filter: 'restarts >= 3 and namespace = a' }));
    await until(() => list.value.state === 'live' && count.value.state === 'live');
    expect(list.value.items.map((i) => i.values?.['core.name'])).toEqual(['p0', 'p1', 'p4', 'p8', 'p11']);
    // p3 and p9: of a, 3 and 4 restarts.
    expect(count.value.total?.count).toBe(2);
    // Its windows one after another, past each one's cursor (the first scanned, the next of it ordered).
    const ask = (after?: string) =>
      read(source.list<KubeObject>({ kind: 'pods.v1', filter: 'phase = Pending', sort: [{ field: 'core.name' }], page: { limit: 2, ...(after ? { after } : {}) } }));
    const one = ask();
    await until(() => one.value.state === 'live');
    const two = ask(one.value.next);
    await until(() => two.value.state !== 'loading');
    expect([one.value.items.map((i) => i.object?.metadata?.name), two.value.error, two.value.items.map((i) => i.object?.metadata?.name)]).toEqual([
      ['p0', 'p4'],
      undefined,
      ['p8'],
    ]);
    kube.put(Pod, pod('p21', 'b'));
    await until(() => list.value.items.some((i) => i.values?.['core.name'] === 'p21'));
    const before = asked().size;
    const wrong = read(source.list({ kind: 'nodes.v1', filter: 'bogus > 1', page: { limit: 1 } }));
    await until(() => wrong.value.state === 'error');
    expect(wrong.value.error).toMatchObject({ code: 'bad_filter', at: { start: 0, end: 5 } });
    expect(asked().size).toBe(before);
  });

  it('says how many of a kind as cheaply as can be: as it is where it is watched, else asked once (a page of one) and kept a while; one not to be listed, why', async () => {
    const { kube, source, read } = await setup([...spread(9), ...namespaces]);
    const size = read(source.size('pods.v1'));
    await until(() => size.value.total !== undefined);
    // Past a page of one: the server's estimate.
    expect(size.value.total).toEqual({ count: 9, exact: false });
    expect(kube.requests.some((r) => r.includes('/pods?') && r.includes('limit=1'))).toBe(true);
    expect(kube.requests.some((r) => r.includes('/pods') && r.includes('watch'))).toBe(false);
    const some = read(source.size('pods.v1', { namespaces: ['a', 'b'] }));
    await until(() => some.value.total !== undefined);
    expect(some.value.total?.count).toBe(6);
    // Watched now: as it is, live.
    const list = read(source.list({ kind: 'pods.v1', page: { limit: 1 } }));
    await until(() => list.value.state === 'live');
    kube.put(Pod, pod('p99', 'a'));
    await until(() => size.value.total?.count === 10);
    kube.forbidden.add('/api/v1/nodes');
    const nodes = read(source.size('nodes.v1'));
    await until(() => nodes.value.error !== undefined);
    expect(nodes.value.error?.status).toBe(403);
  });

  it('searches every kind: one watched as it is, the rest listed once (their metadata, nothing watched), one not to be listed said so', async () => {
    const { kube, source, read } = await setup([...spread(6), ...namespaces, [Node, { metadata: { name: 'p-node' } } as KubeObject]]);
    // Things refused of every namespace, of a also: asked namespace by namespace, those allowed — in part.
    kube.forbidden.add('/apis/example.com/v1/things');
    kube.forbidden.add('/apis/example.com/v1/namespaces/a/things');
    kube.put(Thing, { metadata: { name: 'p1-thing', namespace: 'b' } } as KubeObject);
    const found = read(source.search({ text: 'p1' }));
    await until(() => found.value.searched === found.value.kinds && found.value.kinds > 0);
    expect(found.value.groups.map((g) => [g.kind, g.items.map((i) => i.name)])).toEqual([
      ['pods.v1', ['p1']],
      ['things.v1.example.com', ['p1-thing']],
    ]);
    expect([found.value.denied, found.value.partial]).toEqual([[], ['things.v1.example.com']]);
    expect(kube.requests.some((r) => r.includes('/pods') && r.includes('watch'))).toBe(false);
    // Watched now: as it is.
    const list = read(source.list({ kind: 'pods.v1', page: { limit: 1 } }));
    await until(() => list.value.state === 'live');
    kube.put(Pod, pod('p10', 'a'));
    await until(() => found.value.groups[0]?.items.some((i) => i.name === 'p10') === true);
  });

  it('asks every namespace once for a search in a scope (filtered after), each namespace only where refused; past maxNamespaces, said partial', async () => {
    const { kube, source, read } = await setup([...spread(9), ...namespaces], { maxNamespaces: 1 });
    const scoped = read(source.search({ text: 'p1', scope: { namespaces: ['a', 'b'] } }));
    await until(() => scoped.value.kinds > 0 && scoped.value.searched === scoped.value.kinds);
    expect(kube.requests.filter((r) => r.includes('/pods?')).map((r) => r.split('?')[0])).toEqual(['GET /api/v1/pods']);
    // Refused of every namespace, one namespace asked at most: what it found in a, the kind said partial; its count at least so many.
    const other = await setup([...spread(9), ...namespaces], { maxNamespaces: 1 });
    other.kube.forbidden.add('/api/v1/pods');
    const found = other.read(other.source.search({ text: 'p3' }));
    await until(() => found.value.kinds > 0 && found.value.searched === found.value.kinds);
    expect([found.value.groups[0]?.items.every((i) => i.namespace === 'a'), found.value.partial]).toEqual([true, ['pods.v1']]);
    const size = other.read(other.source.size('pods.v1'));
    await until(() => size.value.total !== undefined);
    expect(size.value.total?.atLeast).toBe(true);
  });

  it('says why it cannot count, nor search, when what the cluster serves cannot be known — not on its way for ever', () => {
    // A connector whose discovery failed at once: nothing else of it asked.
    const connector = {
      discovery: { kinds: signal(null), state: signal('error'), error: signal({ status: 500, code: 'InternalError', message: 'down' }) },
      session: signal('ok'),
      feeds: { find: () => undefined, all: () => [] },
    } as unknown as Parameters<typeof createSource>[0];
    const source = createSource(connector);
    expect([source.size('pods.v1').value.error?.code, source.search({ text: 'web' }).value.error?.code]).toEqual(['InternalError', 'InternalError']);
  });

  it('of a CRD’s kind is asked by its columns, its CRD as it is now', async () => {
    const things = Array.from({ length: 3 }, (_, i) => [Thing, { metadata: { name: `t${i}`, namespace: 'a' }, spec: { size: i, owner: `o${2 - i}` } }] as [typeof Pod, KubeObject]);
    const { kube, source, read } = await setup([[CRD, thingsCrd([{ name: 'Size', type: 'integer', jsonPath: '.spec.size' }])], ...things]);
    const bySize = read(source.list({ kind: 'things.v1.example.com', sort: [{ field: 'things.v1.example.com.size', desc: true }], page: { limit: 1 } }));
    await until(() => bySize.value.state === 'live');
    expect(bySize.value.items.map((i) => i.key)).toEqual(['a/t2']);
    kube.put(CRD, thingsCrd([{ name: 'Owner', type: 'string', jsonPath: '.spec.owner' }]));
    const byOwner = read(source.list({ kind: 'things.v1.example.com', sort: [{ field: 'things.v1.example.com.owner' }], page: { limit: 1 } }));
    await until(() => byOwner.value.state === 'live' && bySize.value.state === 'error');
    expect([byOwner.value.items.map((i) => i.key), bySize.value.error?.code]).toEqual([['a/t2'], 'unknown_field']);
  });
});

describe('what a query is told', () => {
  it('of a kind in namespaces, a get without one: a query that cannot be', async () => {
    const { source, read } = await setup(spread(3));
    const one = read(source.get({ kind: 'pods.v1', name: 'p0' }));
    await until(() => one.value.state === 'error');
    expect(one.value.error?.code).toBe('bad_query');
  });

  it('a namespace given twice: its objects once', async () => {
    const { source, read } = await setup(spread(6));
    const twice = read(source.count({ kind: 'pods.v1', scope: { namespaces: ['a', 'a'] } }));
    await until(() => twice.value.state === 'live');
    expect([twice.value.total?.count, twice.value.coverage.namespaces]).toEqual([2, ['a']]);
  });

  it('a kind’s fields, live: its CRD’s columns as they are now; the revision moving when the fields do', async () => {
    const things = [[Thing, { metadata: { name: 't', namespace: 'a' }, spec: { a: 1, b: 2 } }] as [typeof Pod, KubeObject]];
    const { kube, source, read } = await setup([[CRD, thingsCrd([{ name: 'V', type: 'integer', jsonPath: '.spec.a' }])], ...things]);
    const fields = read(source.fields('things.v1.example.com'));
    const list = read(source.list({ kind: 'things.v1.example.com', page: { limit: 1 }, select: ['things.v1.example.com.v'] }));
    await until(() => list.value.state === 'live' && fields.value.state === 'live');
    expect(fields.value.catalog?.fields['things.v1.example.com.v']).toMatchObject({ type: 'number', value: '.spec.a' });
    const before = list.value.revision;
    kube.put(CRD, thingsCrd([{ name: 'V', type: 'integer', jsonPath: '.spec.b' }]));
    await until(() => list.value.items[0]?.values?.['things.v1.example.com.v'] === 2);
    expect(list.value.revision).not.toBe(before);
    expect(fields.value.catalog?.fields['things.v1.example.com.v']).toMatchObject({ value: '.spec.b' });
  });

  it('a kind’s fields, those addons add over its own (held to CEL’s bound), as they come; a CRD’s columns as it says them', async () => {
    const layers = signal<readonly Layer[]>([]);
    const crd = thingsCrd([{ name: 'Size', type: 'integer', jsonPath: '.spec.size', priority: 1 } as never]);
    const { source, read } = await setup([[CRD, crd], ...spread(3)], { layers });
    const things = read(source.fields('things.v1.example.com'));
    const byOwn = read(source.list({ kind: 'pods.v1', sort: [{ field: 'acme.n', desc: true }], page: { limit: 1 }, select: ['acme.n'] }));
    await until(() => things.value.state === 'live' && byOwn.value.state === 'error');
    expect(things.value.columns).toEqual([expect.objectContaining({ field: 'things.v1.example.com.size', name: 'Size', type: 'integer', priority: 1 })]);
    expect(byOwn.value.error?.code).toBe('unknown_field');
    layers.value = [
      {
        fields: {
          'acme.n': { kinds: ['pods.v1'], type: 'number', value: { cel: 'int(self.metadata.name.substring(1))' } },
          'acme.bad': { type: 'number', value: { cel: 'nope(' } },
        },
      },
    ];
    await until(() => byOwn.value.state === 'live');
    expect(byOwn.value.items[0]?.values).toEqual({ 'acme.n': 2 });
    const pods = read(source.fields('pods.v1'));
    await until(() => pods.value.state === 'live');
    expect(Object.keys(pods.value.rejected ?? {})).toEqual(['acme.bad']);
  });

  it('has fields joined of another kind’s objects (the same namespace and name) — read only for a query asking by them, live as they change', async () => {
    const thing = (name: string, namespace: string, size: number) => ({ metadata: { name, namespace, uid: `t-${namespace}-${name}` }, spec: { size } }) as KubeObject;
    const layers = signal<readonly Layer[]>([{ fields: { 'acme.size': { kinds: ['pods.v1'], type: 'number', value: { from: 'things.v1.example.com', field: '.spec.size' } } } }]);
    const { kube, source, read, asked } = await setup([...spread(3), [Thing, thing('p0', 'a', 1)], [Thing, thing('p2', 'c', 7)]], { layers });
    const plain = read(source.list({ kind: 'pods.v1', sort: [{ field: 'core.name' }], page: { limit: 5 } }));
    const filtered = read(source.list({ kind: 'pods.v1', filter: 'restarts > 0', page: { limit: 5 } }));
    await until(() => plain.value.state === 'live' && filtered.value.state === 'live');
    expect([...asked()].some((p) => p.includes('/things'))).toBe(false);
    const by = read(source.list({ kind: 'pods.v1', sort: [{ field: 'acme.size', desc: true }], page: { limit: 5 }, select: ['core.name', 'acme.size'] }));
    await until(() => by.value.items[0]?.values?.['acme.size'] === 7);
    expect(by.value.items.map((i) => [i.values?.['core.name'], i.values?.['acme.size']])).toEqual([
      ['p2', 7],
      ['p0', 1],
      ['p1', null],
    ]);
    kube.put(Thing, thing('p1', 'b', 30));
    await until(() => by.value.items[0]?.values?.['core.name'] === 'p1');
  });

  it('has fields joined by a key (those of its namespace whose field is its own), reduced — live as those change', async () => {
    const thing = (name: string, namespace: string, owner: string, size: number) =>
      ({ metadata: { name, namespace, uid: `t-${namespace}-${name}`, labels: { owner } }, spec: { size } }) as KubeObject;
    const join = { from: 'things.v1.example.com', field: '.spec.size', by: 'core.name', to: '.metadata.labels.owner' };
    const layers = signal<readonly Layer[]>([
      {
        fields: {
          'acme.max': { kinds: ['pods.v1'], type: 'number', value: { ...join, reduce: 'max' } },
          'acme.count': { kinds: ['pods.v1'], type: 'number', value: { ...join, reduce: 'count' } },
        },
      },
    ]);
    const { kube, source, read } = await setup([...spread(2), [Thing, thing('t1', 'a', 'p0', 3)], [Thing, thing('t2', 'a', 'p0', 8)], [Thing, thing('t3', 'a', 'p1', 50)]], {
      layers,
    });
    const by = read(source.list({ kind: 'pods.v1', sort: [{ field: 'acme.max', desc: true }], page: { limit: 5 }, select: ['core.name', 'acme.max', 'acme.count'] }));
    await until(() => by.value.items[0]?.values?.['acme.max'] === 8);
    // p1 is in b: t3 (of a) is not its.
    expect(by.value.items.map((i) => [i.values?.['core.name'], i.values?.['acme.max'], i.values?.['acme.count']])).toEqual([
      ['p0', 8, 2],
      ['p1', null, 0],
    ]);
    kube.put(Thing, thing('t4', 'b', 'p1', 20));
    await until(() => by.value.items[0]?.values?.['core.name'] === 'p1');
    expect(by.value.items[0]?.values).toEqual({ 'core.name': 'p1', 'acme.max': 20, 'acme.count': 1 });
  });

  it('has a joined field none of another kind it may not list — its objects had before let go of', async () => {
    const thing = (name: string, namespace: string, size: number) => ({ metadata: { name, namespace, uid: `t-${namespace}-${name}` }, spec: { size } }) as KubeObject;
    const layers = signal<readonly Layer[]>([{ fields: { 'acme.size': { kinds: ['pods.v1'], type: 'number', value: { from: 'things.v1.example.com', field: '.spec.size' } } } }]);
    const { source, read } = await setup([...spread(1), [Thing, thing('p0', 'a', 1)]], { layers }, 30, ['/apis/example.com/v1/things']);
    const by = read(source.list({ kind: 'pods.v1', sort: [{ field: 'acme.size' }], page: { limit: 5 }, select: ['acme.size'] }));
    await until(() => by.value.state === 'live');
    expect(by.value.items.map((i) => i.values)).toEqual([{ 'acme.size': null }]);
  });

  it('counts with fields summed — scanned, not as many as there are: in all and by a field', async () => {
    const { source, read } = await setup(spread(6));
    const restarts = read(source.count({ kind: 'pods.v1', groupBy: 'core.namespace', sum: ['pods.v1.restarts'] }));
    await until(() => restarts.value.state === 'live');
    const { total, sums, groups } = restarts.value;
    expect([total?.count, sums, groups?.map((g) => [g.value, g.count, g.sums?.['pods.v1.restarts']])]).toEqual([
      6,
      { 'pods.v1.restarts': 10 },
      [
        ['a', 2, 3],
        ['b', 2, 5],
        ['c', 2, 2],
      ],
    ]);
    const all = read(source.count({ kind: 'pods.v1', sum: ['pods.v1.restarts'] }));
    await until(() => all.value.state === 'live');
    expect(all.value.sums).toEqual({ 'pods.v1.restarts': 10 });
  });

  it('is the same answer for the same query, its parts in any order', async () => {
    const { source, read } = await setup(spread(3));
    const one = read(source.count({ kind: 'pods.v1', groupBy: 'core.namespace', top: 2 }));
    expect(source.count({ top: 2, groupBy: 'core.namespace', kind: 'pods.v1' })).toBe(one);
  });

  it('closing the connector while queries are read throws nothing', async () => {
    const { connector, source, read } = await setup(spread(3));
    const all = read(source.count({ kind: 'pods.v1' }));
    const some = read(source.count({ kind: 'pods.v1', scope: { namespaces: ['a'] } }));
    await until(() => all.value.state === 'live' && some.value.state === 'live');
    expect(() => connector.close()).not.toThrow();
  });
});

describe('a plan', () => {
  it('reads every namespace from one feed, and some namespaces from it too when it is there; else a feed for each', async () => {
    const { source, read, asked } = await setup(spread(9));
    const some = read(source.count({ kind: 'pods.v1', scope: { namespaces: ['a', 'b'] } }));
    await until(() => some.value.state === 'live');
    expect([some.value.total?.count, [...asked()].sort()]).toEqual([6, ['/api/v1/namespaces/a/pods', '/api/v1/namespaces/b/pods']]);
    const all = read(source.count({ kind: 'pods.v1' }));
    await until(() => all.value.state === 'live');
    const later = read(source.count({ kind: 'pods.v1', scope: { namespaces: ['c'] } }));
    await until(() => later.value.state === 'live');
    expect([all.value.total?.count, later.value.total?.count, later.value.coverage.namespaces]).toEqual([9, 3, ['c']]);
    expect(asked().has('/api/v1/namespaces/c/pods')).toBe(false);
  });

  it.each([30, 0])(
    'moves onto a feed of every namespace others come to hold, and back off it when they let it go — no gap, never holding the whole cluster for a few namespaces (linger %i ms)',
    async (lingerMs) => {
      const { kube, connector, source, read, offs } = await setup(spread(9), {}, lingerMs);
      const pods = (namespace?: string) => connector.feeds.find(namespace ? { kind: Pod, namespace } : { kind: Pod });
      const some = read(source.count({ kind: 'pods.v1', scope: { namespaces: ['a', 'b'] } }));
      // Another of some namespaces: it never takes the first's keeping of the whole cluster for a hold.
      const other = read(source.count({ kind: 'pods.v1', scope: { namespaces: ['c'] } }));
      await until(() => some.value.state === 'live' && other.value.state === 'live');
      // Every answer from now on: whole and live.
      const seen: string[] = [];
      offs.push(some.subscribe((r) => seen.push(`${r.state}:${r.total?.count}`)));
      const all = source.count({ kind: 'pods.v1' });
      const stopAll = all.subscribe(() => {});
      await until(() => connector.feeds.holders({ kind: Pod }) === 1 && connector.feeds.holders({ kind: Pod, namespace: 'a' }) === 0);
      // Its own feeds gone (their linger over): going back, they are listed anew.
      await until(() => pods('a') === undefined);
      stopAll();
      // Its own feeds held again at once, listed; the whole cluster's read (kept weakly: held by no one) till they are in.
      await until(() => connector.feeds.holders({ kind: Pod, namespace: 'a' }) === 1 && connector.feeds.holders({ kind: Pod }) === 0);
      await until(() => pods('a')?.state.value === 'live' && pods('b')?.state.value === 'live');
      expect(new Set(seen)).toEqual(new Set(['live:6']));
      await until(() => connector.feeds.holders({ kind: Pod, namespace: 'c' }) === 1 && pods('c')?.state.value === 'live');
      expect(other.value).toMatchObject({ state: 'live', total: { count: 3 } });
      kube.put(Pod, pod('late', 'b'));
      await until(() => some.value.total?.count === 7);
    },
  );

  it('reads a feed of every namespace being listed (the page opening): no feed of its own for each namespace', async () => {
    const { source, read, asked } = await setup(spread(9));
    const all = read(source.count({ kind: 'pods.v1' }));
    const tiles = ['a', 'b', 'c'].map((n) => read(source.count({ kind: 'pods.v1', scope: { namespaces: [n] } })));
    await until(() => all.value.state === 'live' && tiles.every((t) => t.value.state === 'live'));
    expect([[...asked()], tiles.map((t) => t.value.total?.count)]).toEqual([['/api/v1/pods'], [3, 3, 3]]);
  });

  it('answers some namespaces of a feed of every one anew only when theirs change', async () => {
    const { kube, source, read } = await setup(spread(6));
    const all = read(source.count({ kind: 'pods.v1' }));
    const a = read(source.count({ kind: 'pods.v1', scope: { namespaces: ['a'] } }));
    await until(() => all.value.state === 'live' && a.value.state === 'live');
    // What the lists told settled (once a frame).
    await new Promise((r) => setTimeout(r, 50));
    const revision = a.value.revision;
    kube.put(Pod, pod('late', 'b'));
    await until(() => all.value.total?.count === 7);
    expect(a.value.revision).toBe(revision);
    kube.put(Pod, pod('late', 'a'));
    await until(() => a.value.total?.count === 3);
  });

  it('gets one of a kind of no namespace by its name, a namespace given or not', async () => {
    const { source, read } = await setup([[Node, { metadata: { name: 'n1' } } as KubeObject]]);
    const one = read(source.get({ kind: 'nodes.v1', namespace: 'x', name: 'n1' }));
    await until(() => one.value.state === 'live');
    expect(one.value.object).toMatchObject({ metadata: { name: 'n1' } });
  });

  it('lists one object by its name in one namespace as it gets it: by its name alone, no namespace listed', async () => {
    const { source, read, kube } = await setup(spread(3));
    const one = read(
      source.list({ kind: 'pods.v1', scope: { namespaces: ['b'] }, where: { field: 'core.name', op: 'eq', value: 'p1' }, page: { limit: 1 }, select: ['core.name'] }),
    );
    await until(() => one.value.state === 'live');
    expect(one.value.items.map((i) => i.key)).toEqual(['b/p1']);
    expect(kube.requests.filter((r) => r.includes('/namespaces/b/pods') && !r.includes('fieldSelector'))).toEqual([]);
  });

  it('gets one object from a feed others hold that has it, else by its name alone', async () => {
    const { source, read, asked, kube } = await setup(spread(3));
    const one = read(source.get({ kind: 'pods.v1', namespace: 'b', name: 'p1' }));
    await until(() => one.value.state === 'live');
    expect(one.value.object).toMatchObject({ metadata: { name: 'p1' } });
    expect([...asked()]).toEqual(['/api/v1/namespaces/b/pods']);
    expect(kube.requests.some((r) => r.includes('fieldSelector=metadata.name%3Dp1'))).toBe(true);
    const node = read(source.get({ kind: 'nodes.v1', name: 'gone' }));
    await until(() => node.value.state === 'live');
    expect(node.value.object).toBeUndefined();
  });

  it('asks each namespace when every one is refused: those refused denied, the rest answered (partial)', async () => {
    const { kube, source, read } = await setup([...namespaces, ...spread(9)]);
    kube.forbidden.add('/api/v1/pods');
    kube.forbidden.add('/api/v1/namespaces/b/pods');
    const all = read(source.count({ kind: 'pods.v1' }));
    await until(() => all.value.state === 'partial');
    expect([all.value.total?.count, all.value.coverage]).toEqual([6, { namespaces: ['a', 'c'], denied: ['b'] }]);
  });

  it('is denied when it may list neither the kind nor the namespaces, and none are given', async () => {
    const { kube, source, read } = await setup([...namespaces, ...spread(3)]);
    for (const path of ['/api/v1/pods', '/api/v1/namespaces']) kube.forbidden.add(path);
    const all = read(source.count({ kind: 'pods.v1' }));
    await until(() => all.value.state === 'denied');
    expect([all.value.error?.status, all.value.total]).toEqual([403, undefined]);
  });

  it('asks the namespaces it is given when the namespaces cannot be listed either — as they are said; none allowed: denied', async () => {
    const given = signal<readonly string[]>(['c']);
    const { kube, source, read } = await setup([...namespaces, ...spread(9)], { namespaces: () => given.value });
    for (const path of ['/api/v1/pods', '/api/v1/namespaces', '/api/v1/namespaces/c/pods']) kube.forbidden.add(path);
    const all = read(source.count({ kind: 'pods.v1' }));
    await until(() => all.value.state === 'denied');
    expect(all.value.coverage).toEqual({ namespaces: [], denied: ['c'] });
    // One the user adds (they may use it): read at once.
    given.value = ['a', 'c'];
    await until(() => all.value.state === 'partial');
    expect([all.value.coverage, all.value.total?.count]).toEqual([{ namespaces: ['a'], denied: ['c'] }, 3]);
  });

  it('lists a kind of a group when the CRDs may not be listed: taken as no CRD’s', async () => {
    const { source, read } = await setup([[Thing, { metadata: { name: 't', namespace: 'a', uid: 't' } } as KubeObject]], {}, 30, [
      '/apis/apiextensions.k8s.io/v1/customresourcedefinitions',
    ]);
    const things = read(source.list({ kind: 'things.v1.example.com', page: { limit: 10 } }));
    await until(() => things.value.state === 'live');
    expect(things.value.items.map((i) => i.key)).toEqual(['a/t']);
  });

  it('holds its feeds while it is read, and lets them go after', async () => {
    const { kube, source, offs } = await setup(spread(3));
    const list = source.list({ kind: 'pods.v1', page: { limit: 1 } });
    // Read once, not subscribed: nothing is asked.
    expect(list.value.state).toBe('loading');
    offs.push(list.subscribe(() => {}));
    await until(() => list.value.state === 'live' && kube.watching === 3);
    for (const off of offs.splice(0)) off();
    await until(() => kube.watching === 2);
  });
});

describe('a pod’s log', () => {
  const running = (restarts: number, state: Record<string, unknown> = { running: {} }) =>
    ({ ...pod('web', 'a', 'Running', restarts), status: { phase: 'Running', containerStatuses: [{ name: 'c', restartCount: restarts, state }] } }) as KubeObject;
  const texts = (live: Live<LogResult>) => live.value.lines.map((l) => l.text);

  it('is its newest lines, then each written after; the run over, done — read on as the pod says another run began', async () => {
    const { kube, source, read } = await setup([[Pod, running(0)]]);
    for (const t of ['one', 'two', 'three']) kube.writeLog('a', 'web', 'c', t);
    const log = read(source.log({ kind: 'pods.v1', namespace: 'a', name: 'web', container: 'c', follow: true, limit: 2 }));
    await until(() => log.value.state === 'live' && texts(log).length === 2);
    expect([texts(log), log.value.older?.split(' ')[1]]).toEqual([['two', 'three'], '1']);
    kube.writeLog('a', 'web', 'c', 'four');
    await until(() => texts(log).length === 3);
    // Its run over, as the pod says, then its log ends.
    const seen = read(source.get<KubeObject>({ kind: 'pods.v1', namespace: 'a', name: 'web' }));
    kube.put(Pod, running(0, { terminated: { exitCode: 1 } }));
    await until(() => JSON.stringify(seen.value.object).includes('terminated'));
    kube.endLog('a', 'web', 'c');
    await until(() => log.value.state === 'done');
    // Restarted: the next run's lines, after the last.
    kube.writeLog('a', 'web', 'c', 'five');
    kube.put(Pod, running(1));
    await until(() => texts(log).includes('five') && log.value.state === 'live');
    expect(texts(log)).toEqual(['two', 'three', 'four', 'five']);
  });

  it('let go of by the kubelet, its run still going (a quiet stream), reads on a while after', async () => {
    const { kube, source, read } = await setup([[Pod, running(0)]]);
    kube.writeLog('a', 'web', 'c', 'one');
    const log = read(source.log({ kind: 'pods.v1', namespace: 'a', name: 'web', container: 'c', follow: true, limit: 10 }));
    await until(() => texts(log).length === 1);
    kube.endLog('a', 'web', 'c');
    kube.writeLog('a', 'web', 'c', 'two');
    await until(() => texts(log).includes('two'));
    expect([texts(log), log.value.state]).toEqual([['one', 'two'], 'live']);
  });

  it('of a container not started yet, says so — and is read once the pod says it is', async () => {
    const { kube, source, read } = await setup([
      [Pod, { ...pod('web', 'a'), status: { phase: 'Pending', containerStatuses: [{ name: 'c', state: { waiting: {} } }] } } as KubeObject],
    ]);
    const log = read(source.log({ kind: 'pods.v1', namespace: 'a', name: 'web', container: 'c', follow: true, limit: 10 }));
    await until(() => log.value.state === 'error');
    expect(log.value.error?.message).toContain('waiting to start');
    kube.writeLog('a', 'web', 'c', 'up');
    kube.put(Pod, running(0));
    await until(() => texts(log).includes('up'));
  });

  it('pages back, a window before another — lines of one time told apart — to its first line', async () => {
    const T = '2026-10-17T09:00:30.5Z';
    const { kube, source, read } = await setup([[Pod, running(0)]]);
    for (const t of ['a', 'b']) kube.writeLog('a', 'web', 'c', t);
    for (const t of ['c', 'd', 'e']) kube.writeLog('a', 'web', 'c', t, { time: T });
    kube.writeLog('a', 'web', 'c', 'f', { time: '2026-10-17T09:00:31Z' });
    const q = { kind: 'pods.v1', namespace: 'a', name: 'web', container: 'c', limit: 3 };
    const newest = read(source.log(q));
    await until(() => newest.value.state === 'done');
    expect([texts(newest), newest.value.older]).toEqual([['d', 'e', 'f'], `${T} 2`]);
    const before = read(source.log({ ...q, before: newest.value.older }));
    await until(() => before.value.state === 'done');
    expect(texts(before)).toEqual(['a', 'b', 'c']);
    const first = read(source.log({ ...q, before: before.value.older }));
    await until(() => first.value.state === 'done');
    expect([texts(first), first.value.older]).toEqual([[], undefined]);
  });
});

describe('access', () => {
  it('is what the cluster says the user may do: the cluster’s rules alone, or a namespace’s with them — asked once while read', async () => {
    const { kube, source, read } = await setup();
    const view = { verbs: ['get', 'list', 'watch'], apiGroups: [''], resources: ['pods'] };
    const logs = { verbs: ['get'], apiGroups: [''], resources: ['pods/log'] };
    kube.rules = { cluster: [view], namespaces: { a: [logs] } };
    const cluster = read(source.access({}));
    const a = read(source.access({ namespace: 'a' }));
    expect(cluster.value).toEqual({ state: 'loading', rules: [] });
    await until(() => cluster.value.state === 'live' && a.value.state === 'live');
    expect([cluster.value.rules, a.value.rules]).toEqual([[view], [view, logs]]);
    read(source.access({ namespace: 'a' }));
    expect(kube.requests.filter((r) => r.includes('selfsubjectrulesreviews'))).toHaveLength(2);
  });

  it('says the rules are incomplete when the cluster does', async () => {
    const { kube, source, read } = await setup();
    kube.rules = { cluster: [], incomplete: true };
    const live = read(source.access({ namespace: 'a' }));
    await until(() => live.value.state === 'live');
    expect(live.value).toEqual({ state: 'live', rules: [], incomplete: true });
  });
});
