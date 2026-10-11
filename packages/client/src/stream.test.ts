import { afterEach, describe, expect, it } from 'vitest';
import { Api, type ApiError, type Status } from './api.ts';
import { type StreamOptions, type WatchEvent, type Watcher, WatchStream } from './stream.ts';
import { FakeGateway, kindOf } from './testing.ts';

const Pod = kindOf('', 'v1', 'Pod', 'pods');
const Node = kindOf('', 'v1', 'Node', 'nodes', false);

const closing: WatchStream[] = [];
afterEach(() => {
  for (const s of closing.splice(0)) s.close();
});

type TestWatcher = Watcher & { told: string[]; events: WatchEvent[]; endedWith?: Status };

/** A watcher that records what it is told; it goes on from the last version it saw. */
function watcher(id: string, path: string, version = '1'): TestWatcher {
  const told: string[] = [];
  let rv = version;
  const w: TestWatcher = {
    id,
    path,
    told,
    events: [],
    resourceVersion: () => rv,
    opened: () => told.push('opened'),
    event: (e) => {
      rv = e.object.metadata?.resourceVersion ?? rv;
      w.events.push(e);
      told.push(e.type);
    },
    retrying: (e) => told.push(`retrying ${e.code}`),
    ended: (s) => {
      w.endedWith = s;
      told.push(`ended ${s.code}`);
    },
    disconnected: (e: ApiError) => told.push(`disconnected ${e.code}`),
    waiting: () => told.push('waiting'),
  };
  return w;
}

function setup(options: StreamOptions = {}) {
  const fake = new FakeGateway([Pod, Node]);
  const api = new Api({ fetch: fake.fetch });
  const waits: number[] = [];
  const stream = new WatchStream(api, { debounceMs: 5, retryMs: 10, maxRetryMs: 1000, jitter: 0, onRetry: (w) => waits.push(w), ...options });
  closing.push(stream);
  return { fake, api, stream, waits };
}

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('WatchStream', () => {
  it('opens one stream for the watches asked for together, each from its version', async () => {
    const { fake, stream } = setup();
    const pods = watcher('pods', '/api/v1/pods', '7');
    const nodes = watcher('nodes', '/api/v1/nodes', '9');
    stream.add(pods);
    stream.add(nodes);
    await expect.poll(() => pods.told).toEqual(['opened']);
    expect(nodes.told).toEqual(['opened']);
    expect(fake.streams).toHaveLength(1);
    expect(fake.streams[0].watches).toEqual([
      { id: 'pods', resourceVersion: '7', path: '/api/v1/pods' },
      { id: 'nodes', resourceVersion: '9', path: '/api/v1/nodes' },
    ]);
  });

  it('gives each watch its own events, lines cut anywhere (in a line, in a character)', async () => {
    const { fake, stream } = setup();
    const pods = watcher('pods', '/api/v1/pods');
    stream.add(pods);
    await expect.poll(() => fake.open.length).toBe(1);
    const bytes = new TextEncoder().encode(`${JSON.stringify({ w: 'pods', type: 'ADDED', object: { metadata: { name: 'café', resourceVersion: '5' } } })}\n`);
    const cut = bytes.indexOf(0xc3) + 1; // inside "é"
    fake.open[0].writeRaw(bytes.slice(0, 10));
    fake.open[0].writeRaw(bytes.slice(10, cut));
    fake.open[0].writeRaw(bytes.slice(cut));
    await expect.poll(() => pods.events.length).toBe(1);
    expect(pods.events[0].object.metadata?.name).toBe('café');
  });

  it('opens the stream again without a watch that is removed, closes it when none are left; the others are not told', async () => {
    const { fake, stream } = setup();
    const pods = watcher('pods', '/api/v1/pods');
    stream.add(pods);
    stream.add(watcher('nodes', '/api/v1/nodes'));
    await expect.poll(() => fake.open.length).toBe(1);
    stream.remove('nodes');
    await expect.poll(() => fake.streams.length).toBe(2);
    expect(fake.streams[0].closed).toBe(true);
    expect(fake.streams[1].watches.map((w) => w.id)).toEqual(['pods']);
    // A planned reopening is not a break.
    expect(pods.told.filter((t) => t.startsWith('disconnected'))).toEqual([]);
    stream.remove('pods');
    await expect.poll(() => fake.open.length).toBe(0);
    expect(stream.streams).toBe(0);
  });

  it('never gives a watch put on again a line of the stream opened for the one before', async () => {
    const { fake, stream } = setup({ debounceMs: 50 });
    // Another watch keeps the old stream open while "pods" is taken off and put on again.
    stream.add(watcher('nodes', '/api/v1/nodes'));
    stream.add(watcher('pods', '/api/v1/pods'));
    await expect.poll(() => fake.open.length).toBe(1);
    const old = fake.open[0];
    stream.remove('pods');
    const again = watcher('pods', '/api/v1/pods', '900');
    stream.add(again);
    expect(old.closed).toBe(false);
    // The old stream, still open within the debounce, says things for "pods":
    old.write(
      { w: 'pods', type: 'MODIFIED', object: { metadata: { name: 'a', resourceVersion: '2' } } },
      { w: 'pods', type: 'ERROR', object: { kind: 'Status', code: 403, reason: 'Forbidden' } },
    );
    await expect.poll(() => fake.streams.length).toBe(2);
    await expect.poll(() => again.told).toEqual(['opened']);
    expect(again.resourceVersion()).toBe('900');
    expect(fake.streams[1].watches.find((w) => w.id === 'pods')?.resourceVersion).toBe('900');
  });

  it('passes RETRY on; on ERROR takes the watch off, and closes the stream when it was the last', async () => {
    const { fake, stream } = setup();
    const pods = watcher('pods', '/api/v1/pods');
    stream.add(pods);
    await expect.poll(() => fake.open.length).toBe(1);
    fake.streams[0].write({ w: 'pods', type: 'RETRY', error: { code: 'kube_down', message: 'down' } });
    fake.streams[0].write({ w: 'pods', type: 'ERROR', object: { kind: 'Status', code: 403, reason: 'Forbidden' } });
    await expect.poll(() => pods.told).toEqual(['opened', 'retrying kube_down', 'ended 403']);
    expect(stream.has('pods')).toBe(false);
    await expect.poll(() => fake.open.length).toBe(0);
    await tick();
    expect(fake.streams).toHaveLength(1);
  });

  it('keeps the stream for the others when one watch ends', async () => {
    const { fake, stream } = setup();
    const nodes = watcher('nodes', '/api/v1/nodes');
    stream.add(watcher('pods', '/api/v1/pods'));
    stream.add(nodes);
    await expect.poll(() => fake.open.length).toBe(1);
    fake.streams[0].write({ w: 'pods', type: 'ERROR', object: { kind: 'Status', code: 403 } });
    fake.add(Node, { metadata: { name: 'n' } });
    await expect.poll(() => nodes.events.length).toBe(1);
    expect(nodes.told.filter((t) => t.startsWith('disconnected'))).toEqual([]);
  });

  it('opens the stream again when the gateway lets it go (CLOSE), each watch from where it got to', async () => {
    const { fake, stream } = setup();
    const pods = watcher('pods', '/api/v1/pods');
    stream.add(pods);
    await expect.poll(() => fake.open.length).toBe(1);
    fake.add(Pod, { metadata: { name: 'a', namespace: 'x' } });
    await expect.poll(() => pods.events.length).toBe(1);
    fake.streams[0].write({ type: 'CLOSE', reason: 'slow_client' });
    await expect.poll(() => fake.streams.length).toBe(2);
    expect(pods.told).toContain('disconnected closed');
    expect(fake.streams[1].watches[0].resourceVersion).toBe('101');
  });

  it('goes on from a DELETED’s or a BOOKMARK’s version', async () => {
    const { fake, stream } = setup();
    const pods = watcher('pods', '/api/v1/pods');
    stream.add(pods);
    await expect.poll(() => fake.open.length).toBe(1);
    fake.open[0].write({ w: 'pods', type: 'DELETED', object: { metadata: { name: 'a', resourceVersion: '300' } } });
    fake.open[0].write({ w: 'pods', type: 'BOOKMARK', object: { metadata: { resourceVersion: '310' } } });
    await expect.poll(() => pods.events.length).toBe(2);
    fake.open[0].end();
    await expect.poll(() => fake.streams.length).toBe(2);
    expect(fake.streams[1].watches[0].resourceVersion).toBe('310');
  });

  it('waits longer each time it breaks, though each watch OPENs first; begins again once a stream PINGs', async () => {
    const { fake, stream, waits } = setup();
    stream.add(watcher('pods', '/api/v1/pods'));
    for (let i = 0; i < 4; i++) {
      await expect.poll(() => fake.open.length).toBe(1);
      fake.open[0].end();
      await expect.poll(() => waits.length).toBe(i + 1);
    }
    expect(waits).toEqual([10, 20, 40, 80]);
    await expect.poll(() => fake.open.length).toBe(1);
    fake.open[0].write({ type: 'PING' });
    fake.open[0].end();
    await expect.poll(() => waits.length).toBe(5);
    expect(waits[4]).toBe(10);
  });

  it('begins the waits again after a stream that held for stableMs', async () => {
    const { fake, stream, waits } = setup({ stableMs: 40 });
    stream.add(watcher('pods', '/api/v1/pods'));
    await expect.poll(() => fake.open.length).toBe(1);
    fake.open[0].end();
    await expect.poll(() => fake.open.length).toBe(1);
    await tick(60);
    fake.open[0].end();
    await expect.poll(() => waits.length).toBe(2);
    expect(waits).toEqual([10, 10]);
  });

  it('takes a stream that breaks after its headers, or goes quiet, as broken', async () => {
    const { fake, stream } = setup({ quietMs: 60 });
    const pods = watcher('pods', '/api/v1/pods');
    stream.add(pods);
    await expect.poll(() => fake.open.length).toBe(1);
    fake.open[0].fail();
    await expect.poll(() => fake.streams.length).toBe(2);
    expect(pods.told).toContain('disconnected network');
    // Quiet: no PING for quietMs.
    await expect.poll(() => fake.streams.length).toBeGreaterThanOrEqual(3);
    expect(fake.streams[1].closed).toBe(true);
  });

  it('gives up on a stream whose answer does not begin in time, and opens it again', async () => {
    const { fake, stream } = setup({ openTimeoutMs: 40 });
    const held = fake.hold('GET /watch');
    const pods = watcher('pods', '/api/v1/pods');
    stream.add(pods);
    await expect.poll(() => held.aborted).toBe(true);
    expect(pods.told).toContain('disconnected network');
    await expect.poll(() => pods.told.at(-1)).toBe('opened');
  });

  it('ends the watches of a stream the gateway refuses (400 bad_watch), not trying again', async () => {
    const { fake, stream } = setup();
    fake.answer('GET /watch', { status: 400, body: { error: { code: 'bad_watch', message: 'w=bad: not a collection' } } });
    const bad = watcher('bad', '/version');
    stream.add(bad);
    await expect.poll(() => bad.told).toEqual(['ended 400']);
    expect(bad.endedWith).toMatchObject({ reason: 'bad_watch', message: 'w=bad: not a collection' });
    await tick(50);
    expect(fake.streams).toHaveLength(0);
  });

  it('tries again on any other refusal: the host restarting (404), a proxy’s page, the gateway busy (503)', async () => {
    const { fake, stream } = setup();
    fake.answer(
      'GET /watch',
      { status: 404, body: { message: 'Route GET:/kube/watch not found', error: 'Not Found', statusCode: 404 } },
      { status: 502, body: '<html>Bad Gateway</html>', raw: true },
      { status: 503, body: { error: { code: 'too_many_watches', message: 'at most 500' } } },
    );
    const pods = watcher('pods', '/api/v1/pods');
    stream.add(pods);
    await expect.poll(() => pods.told.at(-1)).toBe('opened');
    expect(pods.told).toEqual(['disconnected http_404', 'disconnected http_502', 'disconnected too_many_watches', 'opened']);
  });

  it('stops when the session is over (401), saying so once, asking nothing more', async () => {
    const { fake, api, stream } = setup();
    fake.answer('GET /watch', { status: 401, body: { message: 'Unauthorized', statusCode: 401 } });
    const pods = watcher('pods', '/api/v1/pods');
    stream.add(pods);
    await expect.poll(() => pods.told).toEqual(['disconnected unauthorized']);
    expect(api.session.value).toBe('expired');
    await tick(60);
    expect(fake.requests.filter((r) => r.startsWith('GET /watch'))).toHaveLength(1);
  });

  it('opens a second stream for watches beyond what one takes', async () => {
    const { fake, stream } = setup({ maxWatches: 1 });
    stream.add(watcher('pods', '/api/v1/pods'));
    stream.add(watcher('nodes', '/api/v1/nodes'));
    await expect.poll(() => fake.open.length).toBe(2);
    expect(fake.open.map((s) => s.watches.map((w) => w.id))).toEqual([['pods'], ['nodes']]);
  });

  it('when no stream has room: asks for room, else the watch waits and gets on once some is free', async () => {
    const { stream } = setup({ maxWatches: 1, maxStreams: 1 });
    let asked = 0;
    stream.needRoom = () => {
      asked++;
    };
    stream.add(watcher('pods', '/api/v1/pods'));
    const nodes = watcher('nodes', '/api/v1/nodes');
    stream.add(nodes);
    expect(asked).toBe(1);
    expect(nodes.told).toEqual(['waiting']);
    stream.remove('pods');
    await expect.poll(() => nodes.told).toEqual(['waiting', 'opened']);
  });

  it('puts a watch on at once when asking for room made some', async () => {
    const { fake, stream } = setup({ maxWatches: 1, maxStreams: 1 });
    stream.add(watcher('pods', '/api/v1/pods'));
    stream.needRoom = () => stream.remove('pods');
    const nodes = watcher('nodes', '/api/v1/nodes');
    stream.add(nodes);
    expect(nodes.told).toEqual([]);
    await expect.poll(() => nodes.told).toEqual(['opened']);
    expect(fake.open.map((s) => s.watches.map((w) => w.id))).toEqual([['nodes']]);
  });

  it('does not open a failed stream again before its wait, whatever watches come and go meanwhile', async () => {
    const { fake, stream, waits } = setup({ retryMs: 200, debounceMs: 5 });
    fake.answer('GET /watch', { status: 503, body: { error: { code: 'too_many_watches', message: 'full' } } });
    stream.add(watcher('pods', '/api/v1/pods'));
    await expect.poll(() => waits.length).toBe(1);
    const failedAt = Date.now();
    for (let i = 0; i < 5; i++) {
      stream.add(watcher(`n${i}`, '/api/v1/nodes'));
      await tick(10);
      stream.remove(`n${i}`);
    }
    await expect.poll(() => fake.requests.filter((r) => r.startsWith('GET /watch')).length, { timeout: 1000 }).toBe(2);
    const second = fake.streams.at(-1)?.at ?? 0;
    expect(second - failedAt).toBeGreaterThanOrEqual(150);
  });

  it('ends only the watch the gateway refuses, the others go on', async () => {
    const { fake, stream } = setup();
    const pods = watcher('pods', '/api/v1/pods');
    const odd = watcher('odd', '/api/v1/nodes');
    fake.answer('GET /watch', { status: 400, body: { error: { code: 'bad_watch', message: 'not a collection', w: 'odd' } } });
    stream.add(pods);
    stream.add(odd);
    await expect.poll(() => odd.told).toEqual(['ended 400']);
    await expect.poll(() => pods.told).toContain('opened');
    expect(fake.open.map((st) => st.watches.map((w) => w.id))).toEqual([['pods']]);
  });

  it('gives a watch whose id the gateway would not take a short one of its own on the stream', async () => {
    const { fake, stream } = setup();
    const long = watcher(`${'very.long.group.example.com'.repeat(4)}/v1/Thing`, '/api/v1/pods');
    stream.add(long);
    await expect.poll(() => long.told).toEqual(['opened']);
    expect(fake.open[0].watches[0].id).toBe('_1');
    fake.add(Pod, { metadata: { name: 'a', namespace: 'x' } });
    await expect.poll(() => long.events.length).toBe(1);
  });

  it('opens a stream the gateway let go of as it stops again, its wait not growing', async () => {
    const { fake, stream, waits } = setup();
    stream.add(watcher('pods', '/api/v1/pods'));
    for (let i = 0; i < 3; i++) {
      await expect.poll(() => fake.open.length).toBe(1);
      fake.open[0].closeWith('shutdown');
      await expect.poll(() => waits.length).toBe(i + 1);
    }
    expect(waits).toEqual([10, 10, 10]);
  });

  it('ends its watches on a refusal that will never pass (another site’s page), and asks nothing again', async () => {
    const { fake, stream } = setup();
    const pods = watcher('pods', '/api/v1/pods');
    fake.answer('GET /watch', { status: 403, body: { error: { code: 'cross_site', message: 'no' } } });
    stream.add(pods);
    await expect.poll(() => pods.told).toEqual(['ended 403']);
    await tick(100);
    expect(fake.requests.filter((r) => r.startsWith('GET /watch'))).toHaveLength(1);
  });

  it('takes a watch the gateway ended off its stream without opening it again for the others', async () => {
    const { fake, stream } = setup();
    const pods = watcher('pods', '/api/v1/pods');
    const nodes = watcher('nodes', '/api/v1/nodes');
    stream.add(pods);
    stream.add(nodes);
    await expect.poll(() => nodes.told).toEqual(['opened']);
    fake.open[0].write({ w: 'pods', type: 'ERROR', object: { kind: 'Status', code: 410, reason: 'Expired' } });
    await expect.poll(() => pods.told).toEqual(['opened', 'ended 410']);
    await tick(100);
    expect(fake.streams).toHaveLength(1);
    expect(fake.open).toHaveLength(1);
  });

  it('leaves alone a line that is nothing of the gateway’s; lets a stream go that sends one too long', async () => {
    const { fake, stream } = setup({ maxLineBytes: 100 });
    const pods = watcher('pods', '/api/v1/pods');
    stream.add(pods);
    await expect.poll(() => pods.told).toEqual(['opened']);
    fake.open[0].write({ w: 'pods', type: 'SURPRISE', object: {} }, { w: 'pods', type: 'MODIFIED' });
    await tick();
    expect(pods.events).toEqual([]);
    fake.open[0].writeRaw(new TextEncoder().encode('x'.repeat(200)));
    await expect.poll(() => pods.told).toContain('disconnected network');
  });
});
