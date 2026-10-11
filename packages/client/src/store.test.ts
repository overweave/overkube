import { effect } from '@preact/signals';
import { afterEach, describe, expect, it } from 'vitest';
import { Api } from './api.ts';
import { Discovery } from './discovery.ts';
import { Store } from './store.ts';
import { type StreamOptions, WatchStream } from './stream.ts';
import { FakeGateway, kindOf } from './testing.ts';

const Pod = kindOf('', 'v1', 'Pod', 'pods');
const Node = kindOf('', 'v1', 'Node', 'nodes', false);
const Certificate = kindOf('cert-manager.io', 'v1', 'Certificate', 'certificates');

const closing: (() => void)[] = [];
afterEach(() => {
  for (const close of closing.splice(0)) close();
});

/** A store over a fake gateway; with discovery unless told otherwise. */
function setup(served = [Pod, Node], options: { discovery?: boolean; lingerMs?: number; retryMs?: number; stream?: StreamOptions } = {}) {
  const fake = new FakeGateway(served);
  const api = new Api({ fetch: fake.fetch });
  const stream = new WatchStream(api, { debounceMs: 5, retryMs: 10, jitter: 0, ...options.stream });
  const discovery = options.discovery === false ? null : new Discovery(api, { retryMs: 10 });
  const store = new Store(api, stream, discovery, { lingerMs: options.lingerMs ?? 50, retryMs: options.retryMs ?? 10 });
  closing.push(() => {
    store.close();
    stream.close();
    discovery?.close();
  });
  void discovery?.load();
  return { fake, store, discovery };
}

const names = (items: ReadonlyMap<string, unknown>) => [...items.keys()].sort();

describe('Store', () => {
  it('lists a kind, then keeps it current from the watch', async () => {
    const { fake, store } = setup();
    fake.add(Pod, { metadata: { name: 'a', namespace: 'media', managedFields: [{ manager: 'kubectl' }] } });
    fake.add(Pod, { metadata: { name: 'b', namespace: 'media' } });
    const pods = store.use(Pod);
    expect(pods.state.value).toBe('loading');
    await expect.poll(() => pods.state.value).toBe('live');
    expect(names(pods.items.value)).toEqual(['media/a', 'media/b']);
    expect(pods.items.value.get('media/a')?.metadata?.managedFields).toBeUndefined();
    // Watched from the list's version on.
    expect(fake.streams[0].watches[0]).toMatchObject({ id: 'v1/Pod', resourceVersion: '102', path: '/api/v1/pods' });

    fake.add(Pod, { metadata: { name: 'c', namespace: 'media' } });
    fake.change(Pod, { metadata: { name: 'a', namespace: 'media', labels: { app: 'a' } } });
    fake.remove(Pod, 'b', 'media');
    await expect.poll(() => names(pods.items.value)).toEqual(['media/a', 'media/c']);
    expect(pods.items.value.get('media/a')?.metadata?.labels).toEqual({ app: 'a' });
  });

  it('publishes a batch of events as one change', async () => {
    const { fake, store } = setup();
    const pods = store.use(Pod);
    await expect.poll(() => pods.state.value).toBe('live');
    const seen: number[] = [];
    const stop = pods.items.subscribe((items) => seen.push(items.size));
    const added = (name: string, rv: string) => ({ w: 'v1/Pod', type: 'ADDED', object: { metadata: { name, namespace: 'x', resourceVersion: rv } } });
    fake.open[0].write(added('a', '201'), added('b', '202'), added('c', '203'), added('d', '204'));
    await expect.poll(() => pods.items.value.size).toBe(4);
    stop();
    // The value it had when subscribed, then the batch: once.
    expect(seen).toEqual([0, 4]);
  });

  it('shares one informer among its users, lets it go when the last one is done, after a while', async () => {
    const { fake, store } = setup();
    const one = store.use(Pod);
    const two = store.use(Pod);
    await expect.poll(() => one.state.value).toBe('live');
    expect(two.items).toBe(one.items);
    expect(fake.requests.filter((r) => r.startsWith('GET /api/v1/pods'))).toHaveLength(1);
    one.release();
    one.release(); // once only
    expect(store.kinds).toEqual(['v1/Pod']);
    two.release();
    expect(store.kinds).toEqual(['v1/Pod']); // lingering
    await expect.poll(() => store.kinds).toEqual([]);
    await expect.poll(() => fake.open.length).toBe(0);
  });

  it('keeps a kind used again while it lingers, without listing it again', async () => {
    const { fake, store } = setup(undefined, { lingerMs: 1000 });
    const first = store.use(Pod);
    await expect.poll(() => first.state.value).toBe('live');
    first.release();
    const again = store.use(Pod);
    expect(again.state.value).toBe('live');
    await new Promise((r) => setTimeout(r, 30));
    expect(fake.requests.filter((r) => r.startsWith('GET /api/v1/pods'))).toHaveLength(1);
  });

  it('lists again when its watch is too far behind (410), replacing what it had', async () => {
    const { fake, store } = setup();
    fake.add(Pod, { metadata: { name: 'old', namespace: 'x' } });
    const pods = store.use(Pod);
    await expect.poll(() => pods.state.value).toBe('live');
    fake.remove(Pod, 'old', 'x'); // missed:
    fake.streams[0].end();
    fake.add(Pod, { metadata: { name: 'new', namespace: 'x' } });
    await expect.poll(() => fake.open.length).toBe(1);
    fake.open[0].write({ w: 'v1/Pod', type: 'ERROR', object: { kind: 'Status', code: 410, reason: 'Expired' } });
    await expect.poll(() => names(pods.items.value)).toEqual(['x/new']);
    await expect.poll(() => pods.state.value).toBe('live');
  });

  it('is stale while the stream is down, live again when the watch opens', async () => {
    const { fake, store } = setup();
    const pods = store.use(Pod);
    await expect.poll(() => pods.state.value).toBe('live');
    fake.openWatches = false;
    fake.streams[0].end();
    await expect.poll(() => pods.state.value).toBe('stale');
    expect(pods.error.value?.code).toBe('network');
    await expect.poll(() => fake.open.length).toBe(1);
    fake.open[0].write({ w: 'v1/Pod', type: 'OPEN' });
    await expect.poll(() => pods.state.value).toBe('live');
    expect(pods.error.value).toBeNull();
  });

  it('says why a kind cannot be had (403), and does not try again by itself', async () => {
    const { fake, store } = setup();
    fake.answer('GET /api/v1/pods', { status: 403, body: { kind: 'Status', code: 403, reason: 'Forbidden', message: 'pods is forbidden' } });
    const pods = store.use(Pod);
    await expect.poll(() => pods.state.value).toBe('error');
    expect(pods.error.value).toMatchObject({ status: 403, code: 'Forbidden', message: 'pods is forbidden' });
    await new Promise((r) => setTimeout(r, 50));
    expect(fake.requests.filter((r) => r.startsWith('GET /api/v1/pods'))).toHaveLength(1);
  });

  it('tries a list again while the cluster is down, and goes on when it is back', async () => {
    const { fake, store } = setup();
    fake.answer('GET /api/v1/pods', { status: 503, body: { error: { code: 'kube_down', message: 'down' } } }, 'network');
    const pods = store.use(Pod);
    await expect.poll(() => pods.state.value).toBe('live');
    expect(fake.requests.filter((r) => r.startsWith('GET /api/v1/pods'))).toHaveLength(3);
  });

  it('does not list a kind the cluster does not serve: absent, until it is served', async () => {
    const { fake, store, discovery } = setup();
    const certificates = store.use(Certificate);
    await expect.poll(() => certificates.state.value).toBe('absent');
    expect(fake.requests.some((r) => r.includes('certificates'))).toBe(false);
    fake.served = [Pod, Node, Certificate];
    fake.add(Certificate, { metadata: { name: 'web', namespace: 'media' } });
    await discovery?.load();
    await expect.poll(() => certificates.state.value).toBe('live');
    expect(names(certificates.items.value)).toEqual(['media/web']);
    // And absent again once it goes.
    fake.served = [Pod, Node];
    await discovery?.load();
    await expect.poll(() => certificates.state.value).toBe('absent');
    expect(certificates.items.value.size).toBe(0);
  });

  it('is live as soon as its list is in, before its watch opens', async () => {
    const { fake, store } = setup();
    fake.openWatches = false;
    fake.add(Pod, { metadata: { name: 'a', namespace: 'x' } });
    const pods = store.use(Pod);
    await expect.poll(() => pods.state.value).toBe('live');
    expect(pods.items.value.size).toBe(1);
  });

  it('lists again after 410s in a row only after a wait that grows', async () => {
    const { fake, store } = setup(undefined, { retryMs: 60 });
    const pods = store.use(Pod);
    await expect.poll(() => fake.open.length).toBe(1);
    const lists = () => fake.requests.filter((r) => r.startsWith('GET /api/v1/pods')).length;
    const gone = { w: 'v1/Pod', type: 'ERROR', object: { kind: 'Status', code: 410, reason: 'Expired' } };
    fake.open[0].write(gone);
    await expect.poll(lists).toBe(2); // the first at once
    await expect.poll(() => fake.open.length).toBe(1);
    fake.open[0].write(gone);
    await new Promise((r) => setTimeout(r, 20));
    expect(lists()).toBe(2); // the next one waits
    await expect.poll(lists).toBe(3);
    expect(pods.state.value).not.toBe('error');
  });

  it('ends a kind refused mid-watch (403), keeping what it had; retry() begins it again', async () => {
    const { fake, store } = setup();
    fake.add(Pod, { metadata: { name: 'a', namespace: 'x' } });
    const pods = store.use(Pod);
    await expect.poll(() => fake.open.length).toBe(1);
    fake.open[0].write({ w: 'v1/Pod', type: 'ERROR', object: { kind: 'Status', code: 403, reason: 'Forbidden', message: 'pods is forbidden' } });
    await expect.poll(() => pods.state.value).toBe('error');
    expect(pods.error.value).toMatchObject({ status: 403, code: 'Forbidden' });
    expect(pods.items.value.size).toBe(1);
    pods.retry();
    await expect.poll(() => pods.state.value).toBe('live');
    expect(pods.error.value).toBeNull();
  });

  it('says why when a later page of its list is refused', async () => {
    const { fake, store } = setup();
    for (const name of ['a', 'b']) fake.add(Pod, { metadata: { name, namespace: 'x' } });
    fake.pageSize = 1;
    fake.answer('GET /api/v1/pods', { status: 200, body: { items: [{ metadata: { name: 'a', namespace: 'x' } }], metadata: { resourceVersion: '102', continue: 'x' } } });
    fake.answer('GET /api/v1/pods', { status: 403, body: { kind: 'Status', code: 403, reason: 'Forbidden' } });
    const pods = store.use(Pod);
    await expect.poll(() => pods.state.value).toBe('error');
    expect(pods.items.value.size).toBe(0);
  });

  it('starts no watch for a kind let go while its list is on the way', async () => {
    const { fake, store } = setup(undefined, { lingerMs: 0 });
    const held = fake.hold('GET /api/v1/pods');
    const pods = store.use(Pod);
    await expect.poll(() => fake.requests.some((r) => r.startsWith('GET /api/v1/pods'))).toBe(true);
    pods.release();
    await expect.poll(() => store.kinds).toEqual([]);
    held.release();
    await new Promise((r) => setTimeout(r, 40));
    expect(fake.streams).toHaveLength(0);
  });

  it('lets kinds nobody holds go at once when the streams have no room', async () => {
    const { fake, store } = setup(undefined, { lingerMs: 10_000, stream: { maxWatches: 1, maxStreams: 1 } });
    const pods = store.use(Pod);
    await expect.poll(() => pods.state.value).toBe('live');
    pods.release(); // lingering
    const nodes = store.use(Node);
    await expect.poll(() => nodes.state.value).toBe('live');
    expect(store.kinds).toEqual(['v1/Node']);
    await expect.poll(() => fake.open.map((s) => s.watches.map((w) => w.id))).toEqual([['v1/Node']]);
  });

  it('keeps a kind’s signals through its being let go: who looked before it was held sees it again', async () => {
    const { fake, store } = setup(undefined, { lingerMs: 10_000, stream: { maxWatches: 1, maxStreams: 1 } });
    fake.add(Pod, { metadata: { name: 'a', namespace: 'x' } });
    const seen = store.peek(Pod); // looked at in a render: not held yet
    await expect.poll(() => seen.state.value).toBe('live');
    const nodes = store.use(Node); // the streams need the room: pods are let go
    await expect.poll(() => nodes.state.value).toBe('live');
    expect(store.kinds).toEqual(['v1/Node']);
    expect(seen.items.value.size).toBe(0); // forgotten, not kept in memory
    nodes.release();
    const held = store.use(Pod); // held from the effect, after
    expect(held.items).toBe(seen.items);
    await expect.poll(() => names(seen.items.value)).toEqual(['x/a']);
    fake.add(Pod, { metadata: { name: 'b', namespace: 'x' } });
    await expect.poll(() => names(seen.items.value)).toEqual(['x/a', 'x/b']);
  });

  it('keeps a kind waiting for room while every kind is held, and watches it once there is', async () => {
    const { fake, store } = setup(undefined, { lingerMs: 0, stream: { maxWatches: 1, maxStreams: 1 } });
    const pods = store.use(Pod);
    await expect.poll(() => fake.open.length).toBe(1);
    const nodes = store.use(Node);
    await expect.poll(() => nodes.error.value?.code).toBe('waiting');
    expect(nodes.state.value).toBe('stale');
    pods.release();
    await expect.poll(() => nodes.error.value).toBeNull();
    await expect.poll(() => fake.open.map((s) => s.watches.map((w) => w.id))).toEqual([['v1/Node']]);
  });

  it('lists a kind that cannot be watched (no watch verb) again now and then, instead of watching it', async () => {
    const fake = new FakeGateway([{ ...Node, verbs: ['get', 'list'] }]);
    const api = new Api({ fetch: fake.fetch });
    const stream = new WatchStream(api, { debounceMs: 5 });
    const store = new Store(api, stream, null, { pollMs: 30 });
    closing.push(() => {
      store.close();
      stream.close();
    });
    const nodes = store.use({ ...Node, verbs: ['get', 'list'] });
    await expect.poll(() => nodes.state.value).toBe('live');
    fake.add(Node, { metadata: { name: 'later' } });
    await expect.poll(() => names(nodes.items.value)).toEqual(['later']);
    expect(fake.streams).toHaveLength(0);
  });

  it('works without discovery: every kind is listed', async () => {
    const { store } = setup(undefined, { discovery: false });
    const pods = store.use(Pod);
    await expect.poll(() => pods.state.value).toBe('live');
  });

  it('tries kinds anyway when discovery fails for good', async () => {
    const { fake, store } = setup();
    fake.answer('GET /apis', { status: 403, body: { kind: 'Status', code: 403, reason: 'Forbidden' } });
    const pods = store.use(Pod);
    await expect.poll(() => pods.state.value).toBe('live');
  });

  it('never lets go of the kind asking for room, peeked only', async () => {
    const { fake, store } = setup(undefined, { lingerMs: 10_000, stream: { maxWatches: 1, maxStreams: 1 } });
    fake.add(Node, { metadata: { name: 'n1' } });
    const pods = store.use(Pod);
    await expect.poll(() => fake.open.length).toBe(1);
    pods.release();
    const nodes = store.peek(Node);
    await expect.poll(() => fake.open.map((s) => s.watches.map((w) => w.id))).toEqual([['v1/Node']]);
    expect([nodes.state.value, names(nodes.items.value)]).toEqual(['live', ['n1']]);
  });

  it('keeps a kind peeked again and again, however long', async () => {
    const { store } = setup(undefined, { lingerMs: 60 });
    for (let i = 0; i < 4; i++) {
      store.peek(Pod);
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(store.kinds).toContain('v1/Pod');
  });

  it('takes nothing once closed', () => {
    const { store } = setup();
    store.close();
    expect(() => store.use(Pod)).toThrow('the store is closed');
    expect(() => store.peek(Pod)).toThrow('the store is closed');
  });

  it('starts no watch for a kind whose list a reader stopped as it was published', async () => {
    const { fake, store } = setup();
    const pods = store.peek(Pod);
    let closed = false;
    const stop = effect(() => {
      if (pods.state.value === 'live' && !closed) {
        closed = true;
        store.close();
      }
    });
    await expect.poll(() => closed).toBe(true);
    stop();
    await new Promise((r) => setTimeout(r, 50));
    expect(fake.requests.filter((r) => r.startsWith('GET /watch'))).toEqual([]);
  });

  it('publishes nothing for what changed nothing: a delete of what it never had, the same version again', async () => {
    const { fake, store } = setup();
    fake.add(Pod, { metadata: { name: 'a', namespace: 'x' } });
    const pods = store.use(Pod);
    await expect.poll(() => fake.open.length).toBe(1);
    let published = 0;
    const stop = effect(() => {
      pods.items.value;
      published++;
    });
    const same = pods.items.value.get('x/a');
    fake.open[0].write(
      { w: 'v1/Pod', type: 'DELETED', object: { metadata: { name: 'never', namespace: 'x', resourceVersion: '999' } } },
      { w: 'v1/Pod', type: 'MODIFIED', object: same as object },
    );
    await new Promise((r) => setTimeout(r, 30));
    stop();
    expect(published).toBe(1);
  });

  it('is an error, asking nothing again, when the session ends while it watches', async () => {
    const { fake, store } = setup();
    const pods = store.use(Pod);
    await expect.poll(() => fake.open.length).toBe(1);
    fake.answer('GET /watch', { status: 401, body: '' });
    fake.open[0].fail();
    await expect.poll(() => pods.state.value).toBe('error');
    expect(pods.error.value?.code).toBe('unauthorized');
  });

  it('takes the kind as discovery says it now: no longer watchable, it is listed now and then instead', async () => {
    const { fake, store, discovery } = setup();
    const pods = store.use(Pod);
    await expect.poll(() => fake.open.length).toBe(1);
    fake.served = [{ ...Pod, verbs: ['get', 'list'] }, Node];
    await discovery?.load();
    await expect.poll(() => fake.open.length).toBe(0);
    expect(pods.kind.verbs).toEqual(['get', 'list']);
    expect(pods.state.value).not.toBe('error');
  });

  it('lists a kind refused (403) no more when discovery changes, until retry()', async () => {
    const { fake, store, discovery } = setup();
    fake.answer('GET /api/v1/pods', { status: 403, body: { kind: 'Status', code: 403, reason: 'Forbidden' } });
    const pods = store.use(Pod);
    await expect.poll(() => pods.state.value).toBe('error');
    const lists = () => fake.requests.filter((r) => r.startsWith('GET /api/v1/pods')).length;
    fake.served = [Pod, Node, Certificate];
    await discovery?.load();
    await new Promise((r) => setTimeout(r, 30));
    expect(lists()).toBe(1);
    pods.retry();
    await expect.poll(lists).toBe(2);
  });
});
