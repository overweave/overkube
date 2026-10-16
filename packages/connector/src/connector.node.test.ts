import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { FakeKube, kindOf } from '@overkube/fake-kube';
import { createGateway, fromKubeconfig, type Gateway, resetWatchState } from '@overkube/gateway';
import type { KubeObject } from '@overkube/kube-types';
import { afterEach, describe, expect, it } from 'vitest';
import { type Connector, type ConnectorOptions, createConnector } from './connector.ts';

/*
 * The connector against the real gateway, over a fake API server: feeds
 * listed in pages and watched over one changing stream, shared, let go of;
 * a watch too far behind listed again; the stream lost and found again;
 * what the gateway refuses; discovery following the APIs.
 */

const Pod = kindOf('', 'v1', 'Pod', 'pods');
const Node = kindOf('', 'v1', 'Node', 'nodes', false);
const Status = kindOf('', 'v1', 'ComponentStatus', 'componentstatuses', false, ['get', 'list']);
const CRD = kindOf('apiextensions.k8s.io', 'v1', 'CustomResourceDefinition', 'customresourcedefinitions', false);
const APIService = kindOf('apiregistration.k8s.io', 'v1', 'APIService', 'apiservices', false);

const opened: { kube: FakeKube; gateway: Gateway; server: Server; connector: Connector }[] = [];
afterEach(async () => {
  for (const { kube, gateway, server, connector } of opened.splice(0)) {
    connector.close();
    gateway.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await kube.close();
  }
  resetWatchState();
});

const pod = (name: string, namespace = 'a', labels: Record<string, string> = {}) =>
  ({ apiVersion: 'v1', kind: 'Pod', metadata: { name, namespace, labels, managedFields: [{ manager: 'x' }] }, spec: { nodeName: 'n1' } }) as KubeObject;

async function until(ok: () => boolean): Promise<void> {
  for (let i = 0; i < 300 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(ok()).toBe(true);
}

/** A fake API server with these pods, the gateway in front of it, a connector of the page. */
async function setup(
  pods: KubeObject[] = [],
  options: ConnectorOptions = {},
  fetcher?: (url: string, init: RequestInit) => Promise<Response> | undefined,
  watch: { maxChannels?: number } = {},
) {
  const kube = new FakeKube([Pod, Node, Status, CRD, APIService]);
  for (const p of pods) kube.put(Pod, p);
  const gateway = createGateway({ upstream: fromKubeconfig(await kube.listen()), stream: { retryMs: 20, minLifetimeMs: 0, ...watch } });
  const server = createServer((req, res) => {
    if (!gateway.handle(req, res)) res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const fetch = ((input: string, init: RequestInit) => fetcher?.(input, init) ?? globalThis.fetch(input, init)) as typeof globalThis.fetch;
  const connector = createConnector({
    ...options,
    http: { base, fetch },
    stream: { retryMs: 20, debounceMs: 5, ...options.stream },
    feeds: { lingerMs: 50, retryMs: 20, ...options.feeds },
    rediscoverMs: 10,
  });
  opened.push({ kube, gateway, server, connector });
  // The CRD and APIService feeds the connector holds itself: watched, before the test's own.
  await until(() => kube.watching === 2);
  return { kube, connector, feeds: connector.feeds };
}

const lists = (kube: FakeKube, path: string) => kube.requests.filter((r) => r.startsWith(`GET ${path}?`) && !r.includes('watch=1'));

describe('a feed', () => {
  it('is listed in pages — told as they come, once a frame, not a page at a time — then watched: its events in, managedFields out', async () => {
    const { kube, feeds } = await setup(
      Array.from({ length: 12 }, (_, i) => pod(`p${i}`)),
      { feeds: { pageSize: 5 } },
    );
    const { feed } = feeds.use({ kind: Pod });
    const sizes: number[] = [];
    feed.revision.subscribe(() => sizes.push(feed.objects.size));
    // Live, and told so (its last page told on the frame after it came).
    await until(() => feed.state.value === 'live' && kube.watching === 3 && sizes.at(-1) === 12);
    // Told once a frame, the pages after the first not each: never an answer per page.
    expect([sizes[0], sizes.at(-1), sizes.length <= 3]).toEqual([0, 12, true]);
    expect(lists(kube, '/api/v1/pods')).toHaveLength(3);
    expect(feed.objects.get('a/p1')?.metadata?.managedFields).toBeUndefined();
    kube.put(Pod, pod('new', 'b'));
    kube.delete(Pod, 'a', 'p0');
    await until(() => feed.objects.has('b/new') && !feed.objects.has('a/p0'));
  });

  it('is of a namespace, a name, labels, only metadata — each its own watch on the one stream', async () => {
    const { kube, feeds, connector } = await setup([pod('x', 'a', { app: 'db' }), pod('y', 'a'), pod('x', 'b', { app: 'db' })]);
    const [inA, one, meta] = [
      feeds.use({ kind: Pod, namespace: 'a' }),
      feeds.use({ kind: Pod, namespace: 'b', name: 'x' }),
      feeds.use({ kind: Pod, labelSelector: 'app=db', projection: 'metadata' }),
    ].map((h) => h.feed);
    await until(() => [inA, one, meta].every((f) => f.state.value === 'live') && kube.watching === 5);
    expect([[...inA.objects.keys()], [...one.objects.keys()], [...meta.objects.keys()]]).toEqual([['a/x', 'a/y'], ['b/x'], ['a/x', 'b/x']]);
    expect(meta.objects.get('a/x')).toEqual({ kind: 'PartialObjectMetadata', apiVersion: 'meta.k8s.io/v1', metadata: expect.objectContaining({ name: 'x' }) });
    expect(connector.stream.size).toBe(5);
    kube.put(Pod, pod('z', 'b', { app: 'db' }));
    await until(() => meta.objects.has('b/z'));
    expect(inA.objects.has('b/z')).toBe(false);
  });

  it('is one for one spec, shared; let go a while after the last lets it go, its watch closed', async () => {
    const { kube, feeds } = await setup([pod('x')]);
    const first = feeds.use({ kind: Pod, namespace: 'a' });
    const second = feeds.use({ kind: Pod, namespace: 'a' });
    expect(second.feed).toBe(first.feed);
    await until(() => kube.watching === 3);
    first.release();
    first.release();
    await new Promise((r) => setTimeout(r, 80));
    expect(feeds.keys).toHaveLength(3);
    second.release();
    await until(() => kube.watching === 2 && feeds.keys.length === 2);
    expect(first.feed.objects.size).toBe(0);
  });

  it('is listed again when its watch is too far behind (410), what there is staying until the list is whole', async () => {
    const { kube, feeds } = await setup([pod('x'), pod('y')], { feeds: { pageSize: 1 } });
    const { feed } = feeds.use({ kind: Pod });
    await until(() => feed.state.value === 'live' && kube.watching === 3);
    const sizes: number[] = [];
    feed.revision.subscribe(() => sizes.push(feed.objects.size));
    // The watches end, and the history they would go on from is gone before they are opened again.
    kube.endWatches();
    kube.put(Pod, pod('z'));
    kube.compact();
    await until(() => feed.objects.has('a/z') && feed.state.value === 'live');
    expect(sizes.slice(1).every((n) => n >= 2)).toBe(true);
    expect(lists(kube, '/api/v1/pods')).toHaveLength(2 + 3);
  });

  it('begins its list again when the snapshot expires between pages, never putting two together', async () => {
    let expired = false;
    const { kube, feeds } = await setup([pod('x'), pod('y'), pod('z')], { feeds: { pageSize: 2 } }, (url) => {
      // The first time a list goes on past its first page: the API server has compacted meanwhile.
      if (url.includes('/api/v1/pods?') && url.includes('continue=') && !expired) {
        expired = true;
        kube.expire();
      }
      return undefined;
    });
    const { feed } = feeds.use({ kind: Pod });
    await until(() => feed.state.value === 'live');
    expect(feed.objects.size).toBe(3);
    expect(lists(kube, '/api/v1/pods')).toHaveLength(4);
  });

  it('of a kind that cannot be watched is listed again now and then', async () => {
    const { kube, feeds } = await setup([], { feeds: { pollMs: 30 } });
    const { feed } = feeds.use({ kind: Status });
    await until(() => lists(kube, '/api/v1/componentstatuses').length >= 3);
    expect(feed.state.value).toBe('live');
    expect(kube.watching).toBe(2);
  });

  it('is an error the gateway refuses (a selector too long), the others going on', async () => {
    const { kube, feeds } = await setup([pod('x')]);
    const good = feeds.use({ kind: Pod }).feed;
    await until(() => good.state.value === 'live' && kube.watching === 3);
    const bad = feeds.use({ kind: Pod, labelSelector: `a in (${'x,'.repeat(2100)}y)` }).feed;
    await until(() => bad.state.value === 'error');
    expect(bad.error.value?.code).toBe('bad_stream');
    kube.put(Pod, pod('after'));
    await until(() => good.objects.has('a/after') && good.state.value === 'live');
  });
});

describe('a list once', () => {
  it('reads a kind in pages, nothing watched or kept: its metadata only (managedFields out), of labels, of a namespace, so many at most', async () => {
    const pods = ['p1', 'p2', 'p3', 'p4', 'p5'].map((n, i) => pod(n, i < 3 ? 'a' : 'b', { tier: i % 2 ? 'odd' : 'even' }));
    const { connector, kube } = await setup(pods);
    const all = await connector.list(Pod, { projection: 'metadata', pageSize: 2 });
    expect([all.items.map((o) => o.metadata?.name).sort(), all.truncated]).toEqual([['p1', 'p2', 'p3', 'p4', 'p5'], false]);
    expect([all.items[0].metadata?.managedFields, (all.items[0] as { spec?: unknown }).spec]).toEqual([undefined, undefined]);
    expect((await connector.list(Pod, { labelSelector: 'tier=odd' })).items.map((o) => o.metadata?.name).sort()).toEqual(['p2', 'p4']);
    expect((await connector.list(Pod, { namespace: 'b' })).items.map((o) => o.metadata?.name).sort()).toEqual(['p4', 'p5']);
    const few = await connector.list(Pod, { pageSize: 2, max: 3 });
    expect([few.items.length, few.truncated]).toEqual([3, true]);
    expect(kube.requests.some((r) => r.includes('/pods') && r.includes('watch'))).toBe(false);
  });

  it('counts a kind as cheaply as can be — a page of one, how many past it — of a namespace; a list of one or none: as it is', async () => {
    const { connector, kube } = await setup(['p1', 'p2', 'p3', 'p4'].map((n, i) => pod(n, i < 3 ? 'a' : 'b')));
    // Past a page: the server's estimate (not to be relied on as exact).
    expect(await connector.count(Pod)).toEqual({ count: 4, exact: false });
    expect(await connector.count(Pod, { namespace: 'b' })).toEqual({ count: 1, exact: true });
    expect(await connector.count(Node)).toEqual({ count: 0, exact: true });
    expect(kube.requests.filter((r) => r.includes('/pods?')).every((r) => r.includes('limit=1'))).toBe(true);
    // No estimate said (a server that does not): at least the one read.
    const original = connector.http.get.bind(connector.http);
    connector.http.get = (async (...args: Parameters<typeof original>) => {
      const page = (await original(...args)) as { metadata?: { remainingItemCount?: number } };
      delete page.metadata?.remainingItemCount;
      return page;
    }) as typeof connector.http.get;
    expect(await connector.count(Pod)).toEqual({ count: 1, exact: false, atLeast: true });
  });

  it('keeps to max whatever a server sends; asks nothing of a max of none, nor once closed', async () => {
    const { connector, kube } = await setup(['p1', 'p2', 'p3', 'p4'].map((n) => pod(n)));
    // A server that does not keep to limit: all of them on one page.
    const original = connector.http.get.bind(connector.http);
    connector.http.get = ((path: string, query: Record<string, string | undefined> = {}, ...rest: unknown[]) =>
      (original as (...a: unknown[]) => Promise<unknown>)(path, { ...query, limit: undefined }, ...rest)) as typeof connector.http.get;
    expect(await connector.list(Pod, { max: 2 }).then((l) => [l.items.length, l.truncated])).toEqual([2, true]);
    const before = kube.requests.length;
    expect(await connector.list(Pod, { max: 0 })).toEqual({ items: [], truncated: true });
    expect(kube.requests.length).toBe(before);
    connector.close();
    await expect(connector.list(Pod)).rejects.toMatchObject({ code: 'closed' });
    await expect(connector.count(Pod)).rejects.toMatchObject({ code: 'closed' });
  });

  it('begins again once when its continue goes stale (410); a kind it may not list: the API server’s error', async () => {
    const { connector, kube } = await setup(['p1', 'p2', 'p3'].map((n) => pod(n)));
    let pages = 0;
    const original = connector.http.get.bind(connector.http);
    connector.http.get = (async (...args: Parameters<typeof original>) => {
      const page = await original(...args);
      if (++pages === 1) kube.expire();
      return page;
    }) as typeof connector.http.get;
    expect((await connector.list(Pod, { pageSize: 2 })).items).toHaveLength(3);
    connector.http.get = original;
    kube.forbidden.add('/api/v1/nodes');
    await expect(connector.list(Node)).rejects.toMatchObject({ status: 403, code: 'Forbidden' });
  });
});

describe('the stream', () => {
  it('waits for room: what nobody holds is let go first, one held waits until there is room', async () => {
    const { kube, feeds } = await setup([pod('x', 'a'), pod('x', 'b'), pod('x', 'c')], { stream: { maxSubscriptions: 3 }, feeds: { lingerMs: 10_000 } });
    const a = feeds.use({ kind: Pod, namespace: 'a' });
    await until(() => kube.watching === 3);
    a.release();
    // Lingering, a's place goes to b.
    const b = feeds.use({ kind: Pod, namespace: 'b' });
    await until(() => b.feed.state.value === 'live' && feeds.keys.length === 3);
    const c = feeds.use({ kind: Pod, namespace: 'c' });
    await until(() => c.feed.error.value?.code === 'waiting');
    b.release();
    await until(() => c.feed.state.value === 'live');
  });

  it('is opened again when the gateway lets it go, every feed going on from where it was', async () => {
    const { kube, feeds } = await setup([pod('x')]);
    const { feed } = feeds.use({ kind: Pod });
    await until(() => feed.state.value === 'live' && kube.watching === 3);
    opened[0].gateway.close();
    await until(() => feed.state.value === 'stale');
    kube.put(Pod, pod('meanwhile'));
    await until(() => feed.objects.has('a/meanwhile') && feed.state.value === 'live');
    expect(lists(kube, '/api/v1/pods')).toHaveLength(1);
  });

  it('asks nothing more once the host turns the page away: the session over, the feeds in error', async () => {
    let signedOut = false;
    const { feeds, connector } = await setup([pod('x')], {}, (url) => (signedOut && url.endsWith('/stream') ? Promise.resolve(new Response('no', { status: 401 })) : undefined));
    const { feed } = feeds.use({ kind: Pod });
    await until(() => feed.state.value === 'live');
    signedOut = true;
    opened[0].gateway.close();
    await until(() => feed.state.value === 'error');
    expect([feed.error.value?.code, connector.session.value]).toEqual(['unauthorized', 'expired']);
  });

  it('is closed with the connector: nothing watched', async () => {
    const { kube, feeds, connector } = await setup([pod('x')]);
    feeds.use({ kind: Pod });
    await until(() => kube.watching === 3);
    connector.close();
    await until(() => kube.watching === 0);
  });
});

describe('a change to the stream', () => {
  /** Holds back the answers to changes of the stream while held is true; each one's release. */
  const holding = () => {
    const state = { held: false, waiting: [] as (() => void)[] };
    const fetcher = (url: string, init: RequestInit) => {
      if (!state.held || !/\/stream\/[^/]+$/.test(url)) return undefined;
      return new Promise<Response>((resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        state.waiting.push(() => resolve(globalThis.fetch(url, init)));
      });
    };
    return { state, fetcher };
  };

  it('refused for a subscription let go before the answer came ends nothing: the rest is made again', async () => {
    const { state, fetcher } = holding();
    const { kube, feeds, connector } = await setup([pod('x')], {}, fetcher);
    const good = feeds.use({ kind: Pod }).feed;
    await until(() => good.state.value === 'live');
    state.held = true;
    const bad = feeds.use({ kind: Pod, labelSelector: `a in (${'x,'.repeat(2100)}y)` });
    const other = feeds.use({ kind: Pod, namespace: 'a' }).feed;
    await until(() => state.waiting.length === 1);
    bad.release();
    state.held = false;
    state.waiting[0]();
    await until(() => other.state.value === 'live');
    kube.put(Pod, pod('after'));
    await until(() => good.objects.has('a/after') && other.objects.has('a/after') && good.state.value === 'live');
    expect(connector.stream.size).toBe(4);
  });

  it('not answered in time: the stream opened again, every watch put on it', async () => {
    const { state, fetcher } = holding();
    const { kube, feeds } = await setup([pod('x')], { stream: { changeTimeoutMs: 100 } }, fetcher);
    const first = feeds.use({ kind: Pod }).feed;
    await until(() => first.state.value === 'live');
    state.held = true;
    const second = feeds.use({ kind: Pod, namespace: 'a' }).feed;
    // Listed, its watch not on the stream yet: not live.
    await until(() => second.objects.size === 1);
    expect(second.state.value).toBe('loading');
    state.held = false;
    await until(() => second.state.value === 'live' && first.state.value === 'live');
    kube.put(Pod, pod('after'));
    await until(() => second.objects.has('a/after'));
  });

  it('turned away by the gateway’s budget: tried again after a while (not at once, again and again), the stream kept', async () => {
    let changes = 0;
    const counting = (url: string) => {
      if (/\/stream\/[^/]+$/.test(url)) changes++;
      return undefined;
    };
    const { kube, feeds } = await setup([pod('x')], { stream: { retryMs: 20 } }, counting, { maxChannels: 4 });
    const a = feeds.use({ kind: Pod, namespace: 'a' }).feed;
    const b = feeds.use({ kind: Pod, namespace: 'b' });
    await until(() => a.state.value === 'live' && b.feed.state.value === 'live');
    const c = feeds.use({ kind: Pod, namespace: 'c' }).feed;
    await until(() => c.error.value?.code === 'waiting');
    const before = changes;
    await new Promise((r) => setTimeout(r, 200));
    // 20, 40, 80 ms: a few, not hundreds.
    expect(changes - before).toBeLessThan(6);
    expect(a.state.value).toBe('live');
    b.release();
    await until(() => c.state.value === 'live');
    kube.put(Pod, pod('late', 'a'));
    await until(() => a.objects.has('a/late'));
  });
});

describe('the feeds', () => {
  it('try again one that ended in an error when it is held again (a role granted)', async () => {
    const { kube, feeds } = await setup([pod('x')]);
    kube.forbidden.add('/api/v1/pods');
    const first = feeds.use({ kind: Pod });
    await until(() => first.feed.state.value === 'error');
    first.release();
    kube.forbidden.delete('/api/v1/pods');
    const again = feeds.use({ kind: Pod });
    expect(again.feed).toBe(first.feed);
    await until(() => again.feed.state.value === 'live');
  });

  it('closed, hold nothing more and throw nothing', async () => {
    const { feeds, connector } = await setup();
    connector.close();
    const hold = feeds.use({ kind: Pod });
    expect(hold.feed.state.value).toBe('loading');
    hold.release();
  });
});

describe('discovery', () => {
  it('knows the kinds served, and asks again when the APIs change', async () => {
    const { kube, connector } = await setup();
    await until(() => connector.discovery.kinds.value?.has('v1/Pod') === true);
    const asked = kube.requests.filter((r) => r === 'GET /apis').length;
    kube.put(CRD, { apiVersion: 'apiextensions.k8s.io/v1', kind: 'CustomResourceDefinition', metadata: { name: 'things.example.com' } } as KubeObject);
    await until(() => kube.requests.filter((r) => r === 'GET /apis').length > asked);
  });
});
