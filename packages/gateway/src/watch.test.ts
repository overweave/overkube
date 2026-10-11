import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, get, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fromKubeconfig } from './upstream.ts';
import { parseWatches, resetWatchState, type WatchOptions, watch, watchTotals } from './watch.ts';

const servers: Server[] = [];
const streams: AbortController[] = [];
afterEach(async () => {
  for (const s of streams.splice(0)) s.abort();
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
  await new Promise((r) => setTimeout(r, 20));
  resetWatchState();
});

async function listen(srv: Server): Promise<number> {
  servers.push(srv);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return (srv.address() as AddressInfo).port;
}

function kubeconfigFor(server: string, file = join(mkdtempSync(join(tmpdir(), 'ok-')), 'kubeconfig')): string {
  writeFileSync(
    file,
    `clusters:\n- cluster:\n    server: ${server}\n  name: c\nusers:\n- name: u\n  user:\n    token: t\ncontexts:\n- context:\n    cluster: c\n    user: u\n  name: x\ncurrent-context: x\n`,
  );
  return file;
}

type Handler = (req: IncomingMessage, res: ServerResponse, n: number) => void;

/** A fake API server: a handler per collection; every request it got (when, and whether its socket closed). */
async function fakeKube(handlers: Record<string, Handler>) {
  const requests: { path: string; query: URLSearchParams; at: number; closed: boolean }[] = [];
  const count = new Map<string, number>();
  const srv = createServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://kube');
    const seen = { path: url.pathname, query: url.searchParams, at: Date.now(), closed: false };
    requests.push(seen);
    req.socket.on('close', () => {
      seen.closed = true;
    });
    const n = (count.get(url.pathname) ?? 0) + 1;
    count.set(url.pathname, n);
    const handler = handlers[url.pathname];
    if (handler) handler(req, res, n);
    else res.writeHead(404).end('{"kind":"Status","code":404,"reason":"NotFound"}');
  });
  const port = await listen(srv);
  return { config: kubeconfigFor(`http://127.0.0.1:${port}`), requests, port, of: (path: string) => requests.filter((r) => r.path === path) };
}

const line = (event: object) => `${JSON.stringify(event)}\n`;
const pod = (name: string, rv: string) => ({ kind: 'Pod', metadata: { name, resourceVersion: rv, managedFields: [{ manager: 'kubectl' }] } });

/** Keeps a watch open, writing these events first (headers at once, as the API server does). */
const stream =
  (...events: object[]): Handler =>
  (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.flushHeaders();
    for (const e of events) res.write(line(e));
  };

/** Writes these events and ends the watch. */
const once =
  (...events: object[]): Handler =>
  (req, res, n) => {
    stream(...events)(req, res, n);
    res.end();
  };

/** Fast timings, no jitter, watches that may end at once without counting as broken. */
const FAST: Omit<WatchOptions, 'upstream'> = { pingMs: 60_000, retryMs: 20, maxRetryMs: 2000, jitter: 0, minLifetimeMs: 0, log: () => {} };

/** The gateway serving watch(); open() reads a stream from it, each line JSON-parsed. */
async function gateway(kubeconfig: string, options: Partial<WatchOptions> = {}) {
  const srv = createServer((req, res) => watch({ url: req.url ?? '' }, res, { upstream: fromKubeconfig(kubeconfig), ...FAST, ...options }));
  const port = await listen(srv);
  const query = (w: string[]) => w.map((x) => `w=${encodeURIComponent(x)}`).join('&');
  return {
    port,
    url: (...w: string[]) => `http://127.0.0.1:${port}/watch?${query(w)}`,
    async open(...w: string[]) {
      const abort = new AbortController();
      streams.push(abort);
      const res = await fetch(`http://127.0.0.1:${port}/watch?${query(w)}`, { signal: abort.signal });
      const lines: Record<string, unknown>[] = [];
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let rest = '';
      void (async () => {
        for (;;) {
          const { value, done } = (await reader?.read().catch(() => ({ value: undefined, done: true }))) ?? { done: true };
          if (done) return;
          const parts = (rest + decoder.decode(value)).split('\n');
          rest = parts.pop() ?? '';
          for (const p of parts) if (p) lines.push(JSON.parse(p));
        }
      })();
      return {
        res,
        lines,
        types: () => lines.map((l) => l.type),
        abort: () => abort.abort(),
        async until(match: (l: Record<string, unknown>[]) => boolean, timeout = 3000) {
          await expect.poll(() => match(lines), { timeout }).toBe(true);
        },
      };
    },
  };
}

const gaps = (times: number[]) => times.slice(1).map((t, i) => t - times[i]);

describe('parseWatches', () => {
  it('reads each watch: its id, where it starts, its collection and selectors', () => {
    const specs = parseWatches('/watch?w=pods:42:/api/v1/pods&w=web::/apis/apps/v1/namespaces/media/deployments%3FlabelSelector%3Dapp%253Dweb');
    expect(specs).toMatchObject([
      { id: 'pods', path: '/api/v1/pods', resourceVersion: '42' },
      { id: 'web', path: '/apis/apps/v1/namespaces/media/deployments', resourceVersion: '' },
    ]);
    expect(typeof specs !== 'string' && specs[1].selectors.get('labelSelector')).toBe('app=web');
  });

  it('keeps a selector with a "?" in it whole', () => {
    const specs = parseWatches(`/watch?w=${encodeURIComponent('x::/api/v1/pods?labelSelector=a?b')}`);
    expect(typeof specs !== 'string' && specs[0].selectors.get('labelSelector')).toBe('a?b');
  });

  it('says what is wrong with a request', () => {
    const cases: [string, RegExp][] = [
      ['/watch', /no watch/],
      ['/watch?w=pods', /not <id>:<resourceVersion>:<path>/],
      ['/watch?w=pods:a%20b:/api/v1/pods', /not <id>/],
      ['/watch?w=pods::/healthz', /not a collection/],
      ['/watch?w=v::/version', /not a collection/],
      ['/watch?w=d::/apis', /not a collection/],
      ['/watch?w=d::/apis/apps/v1', /not a collection/],
      ['/watch?w=o::/openapi/v3', /not a collection/],
      ['/watch?w=p::/api/v1/namespaces/media/pods/web', /not a collection/],
      ['/watch?w=p::/api/v1/nodes/kube/proxy', /not a collection/],
      ['/watch?w=pods::/api/../healthz', /not a collection/],
      ['/watch?w=pods::/api/v1/pods%3Fwatch%3D0', /only labelSelector and fieldSelector/],
      ['/watch?w=pods::/api/v1/pods&w=pods::/api/v1/pods', /asked for twice/],
      [`/watch?${Array.from({ length: 51 }, (_, i) => `w=p${i}::/api/v1/pods`).join('&')}`, /at most 50/],
    ];
    for (const [url, why] of cases) expect(parseWatches(url), url).toMatch(why);
  });
});

describe('watch', () => {
  it('carries several watches in one stream, each event tagged, without managedFields', async () => {
    const kube = await fakeKube({
      '/api/v1/pods': stream({ type: 'ADDED', object: pod('a', '11') }),
      '/apis/apps/v1/deployments': stream({ type: 'ADDED', object: { kind: 'Deployment', metadata: { name: 'web', resourceVersion: '12' } } }),
    });
    const s = await (await gateway(kube.config)).open('pods:10:/api/v1/pods', 'deploy::/apis/apps/v1/deployments');
    expect(s.res.headers.get('content-type')).toBe('application/x-ndjson');
    expect(s.res.headers.get('x-accel-buffering')).toBe('no');
    await s.until((l) => l.length >= 4);
    expect(s.lines).toContainEqual({ w: 'pods', type: 'OPEN' });
    expect(s.lines).toContainEqual({ w: 'deploy', type: 'OPEN' });
    expect(s.lines).toContainEqual({ w: 'pods', type: 'ADDED', object: { kind: 'Pod', metadata: { name: 'a', resourceVersion: '11' } } });
    expect(s.lines).toContainEqual({ w: 'deploy', type: 'ADDED', object: { kind: 'Deployment', metadata: { name: 'web', resourceVersion: '12' } } });
    expect(Object.fromEntries(kube.of('/api/v1/pods')[0].query)).toEqual({ watch: '1', allowWatchBookmarks: 'true', resourceVersion: '10' });
    expect(kube.of('/apis/apps/v1/deployments')[0].query.has('resourceVersion')).toBe(false);
  });

  it('goes on quietly from the last version it saw when the API server ends a watch that worked', async () => {
    const kube = await fakeKube({
      '/api/v1/pods': (req, res, n) =>
        n === 1
          ? once({ type: 'ADDED', object: pod('a', '11') }, { type: 'BOOKMARK', object: { kind: 'Pod', metadata: { resourceVersion: '15' } } })(req, res, n)
          : stream({ type: 'MODIFIED', object: pod('a', '16') })(req, res, n),
    });
    const s = await (await gateway(kube.config)).open('pods:10:/api/v1/pods');
    await s.until((l) => l.some((x) => x.type === 'MODIFIED'));
    expect(kube.of('/api/v1/pods').map((r) => r.query.get('resourceVersion'))).toEqual(['10', '15']);
    expect(s.types()).toEqual(['OPEN', 'ADDED', 'BOOKMARK', 'OPEN', 'MODIFIED']);
  });

  it('waits before opening again a watch that ends at once: no storm', async () => {
    const kube = await fakeKube({ '/api/v1/pods': once() });
    const s = await (await gateway(kube.config, { retryMs: 40, minLifetimeMs: 1000 })).open('pods::/api/v1/pods');
    await new Promise((r) => setTimeout(r, 350));
    // 40, 80, 160 ms apart: four requests at most in 350 ms, not thousands.
    expect(kube.of('/api/v1/pods').length).toBeLessThanOrEqual(4);
    expect(s.lines.filter((l) => l.type === 'RETRY')[0]).toMatchObject({ error: { message: 'the watch ended as soon as it opened' } });
  });

  it('goes on quietly when the API server ends a quiet watch that lived long enough (no events, no bookmarks)', async () => {
    const kube = await fakeKube({
      '/api/v1/namespaces': (req, res, n) => {
        stream()(req, res, n);
        if (n === 1) setTimeout(() => res.end(), 150);
      },
    });
    const s = await (await gateway(kube.config, { minLifetimeMs: 100 })).open('ns:7:/api/v1/namespaces');
    await s.until((l) => l.filter((x) => x.type === 'OPEN').length === 2);
    expect(s.types()).toEqual(['OPEN', 'OPEN']);
    expect(kube.of('/api/v1/namespaces')[1].query.get('resourceVersion')).toBe('7');
  });

  it('treats a watch that ends too soon, events or not, as broken', async () => {
    const kube = await fakeKube({ '/api/v1/pods': once({ type: 'ADDED', object: pod('a', '11') }) });
    const s = await (await gateway(kube.config, { minLifetimeMs: 1000 })).open('pods::/api/v1/pods');
    await s.until((l) => l.some((x) => x.type === 'RETRY'));
  });

  it('reads events however the API server splits them', async () => {
    const kube = await fakeKube({
      '/api/v1/pods': (_req, res) => {
        res.writeHead(200);
        const text = line({ type: 'ADDED', object: pod('a', '11') }) + line({ type: 'ADDED', object: pod('b', '12') });
        res.write(text.slice(0, 20));
        setTimeout(() => res.write(text.slice(20, 70)), 10);
        setTimeout(() => res.write(text.slice(70)), 20);
      },
    });
    const s = await (await gateway(kube.config)).open('pods::/api/v1/pods');
    await s.until((l) => l.filter((x) => x.type === 'ADDED').length === 2);
  });

  it('tries again on what is not a watch event, and lives on', async () => {
    for (const bad of ['null', '[]', '"text"', '{"type":"WHAT","object":{}}', '{"type":"ADDED"}', '{"type":"ADDED","object":7}', 'not json']) {
      const kube = await fakeKube({
        '/api/v1/pods': (req, res, n) => {
          if (n === 1) {
            stream()(req, res, n);
            res.write(`${bad}\n`);
          } else stream({ type: 'ADDED', object: pod('a', '1') })(req, res, n);
        },
      });
      const s = await (await gateway(kube.config)).open('pods::/api/v1/pods');
      await s.until((l) => l.some((x) => x.type === 'ADDED'));
      expect(s.types(), bad).toEqual(['OPEN', 'RETRY', 'OPEN', 'ADDED']);
    }
  });

  it('tries again when the API server breaks a watch off, from the last version', async () => {
    const kube = await fakeKube({
      '/api/v1/pods': (req, res, n) => {
        if (n === 1) {
          stream({ type: 'ADDED', object: pod('a', '11') })(req, res, n);
          res.write('{"type":"MODIFIED","obj');
          setTimeout(() => res.socket?.destroy(), 20);
        } else stream({ type: 'MODIFIED', object: pod('a', '12') })(req, res, n);
      },
    });
    const s = await (await gateway(kube.config)).open('pods::/api/v1/pods');
    await s.until((l) => l.some((x) => x.type === 'MODIFIED'));
    expect(s.types()).toEqual(['OPEN', 'ADDED', 'RETRY', 'OPEN', 'MODIFIED']);
    expect(s.lines[2]).toMatchObject({ error: { message: 'the API server broke the watch off' } });
    expect(kube.of('/api/v1/pods')[1].query.get('resourceVersion')).toBe('11');
  });

  it('tries again on an event longer than it takes', async () => {
    const kube = await fakeKube({
      '/api/v1/pods': (req, res, n) => {
        stream()(req, res, n);
        if (n === 1) res.write('x'.repeat(5000));
      },
    });
    const s = await (await gateway(kube.config, { maxLineBytes: 1000 })).open('pods::/api/v1/pods');
    await s.until((l) => l.some((x) => x.type === 'RETRY'));
    expect(s.lines[1]).toMatchObject({ error: { message: 'an event longer than 1000 bytes' } });
  });

  it('ends a watch on 410 Gone and says so; the others go on', async () => {
    const kube = await fakeKube({
      '/api/v1/pods': once({ type: 'ERROR', object: { kind: 'Status', code: 410, reason: 'Expired' } }),
      '/api/v1/nodes': stream({ type: 'ADDED', object: { kind: 'Node', metadata: { name: 'kube', resourceVersion: '3' } } }),
    });
    const s = await (await gateway(kube.config)).open('pods:1:/api/v1/pods', 'nodes::/api/v1/nodes');
    await s.until((l) => l.some((x) => x.type === 'ERROR') && l.some((x) => x.w === 'nodes' && x.type === 'ADDED'));
    expect(s.lines).toContainEqual({ w: 'pods', type: 'ERROR', object: { kind: 'Status', code: 410, reason: 'Expired' } });
    await new Promise((r) => setTimeout(r, 150));
    expect(kube.of('/api/v1/pods')).toHaveLength(1); // not asked again
  });

  it('ends a watch the API server refuses (403, 404), with its Status, cut to a size', async () => {
    const kube = await fakeKube({
      '/api/v1/secrets': (_req, res) => res.writeHead(403).end('{"kind":"Status","code":403,"reason":"Forbidden"}'),
      '/api/v1/configmaps': (_req, res) => res.writeHead(400).end('x'.repeat(5000)),
    });
    const s = await (await gateway(kube.config, { maxErrorBytes: 100 })).open('secrets::/api/v1/secrets', 'gone::/apis/example.com/v1/things', 'big::/api/v1/configmaps');
    await s.until((l) => l.filter((x) => x.type === 'ERROR').length === 3);
    expect(s.lines).toContainEqual({ w: 'secrets', type: 'ERROR', object: { kind: 'Status', code: 403, reason: 'Forbidden' } });
    expect(s.lines).toContainEqual({ w: 'gone', type: 'ERROR', object: { kind: 'Status', code: 404, reason: 'NotFound' } });
    expect(s.lines).toContainEqual({ w: 'big', type: 'ERROR', object: { kind: 'Status', code: 400, message: 'x'.repeat(100) } });
  });

  it('waits longer each time while the API server is in trouble', async () => {
    const kube = await fakeKube({
      '/api/v1/pods': (req, res, n) => (n <= 4 ? res.writeHead(503).end() : stream({ type: 'ADDED', object: pod('a', '11') })(req, res, n)),
    });
    const s = await (await gateway(kube.config, { retryMs: 30 })).open('pods:5:/api/v1/pods');
    await s.until((l) => l.some((x) => x.type === 'ADDED'));
    expect(s.types()).toEqual(['RETRY', 'RETRY', 'RETRY', 'RETRY', 'OPEN', 'ADDED']);
    const waits = gaps(kube.of('/api/v1/pods').map((r) => r.at));
    // 30, 60, 120, 240: each about twice the one before.
    for (let i = 1; i < waits.length; i++) expect(waits[i], `${waits}`).toBeGreaterThan(waits[i - 1] * 1.5);
    expect(kube.of('/api/v1/pods').every((r) => r.query.get('resourceVersion') === '5')).toBe(true);
  });

  it('keeps waiting longer for a watch that opens and fails straight away (no event in between)', async () => {
    const lagging = { kind: 'Status', code: 504, reason: 'Timeout', message: 'Too large resource version: 9319, current: 9314' };
    const kube = await fakeKube({ '/api/v1/pods': once({ type: 'ERROR', object: lagging }) });
    await (await gateway(kube.config, { retryMs: 30 })).open('pods:9319:/api/v1/pods');
    await expect.poll(() => kube.of('/api/v1/pods').length, { timeout: 3000 }).toBeGreaterThanOrEqual(4);
    const waits = gaps(kube.of('/api/v1/pods').map((r) => r.at));
    expect(waits[2], `${waits}`).toBeGreaterThan(waits[0] * 2.5);
  });

  it('tries again after a passing error in the stream, waiting as long as the server says', async () => {
    const lagging = { kind: 'Status', code: 504, reason: 'Timeout', message: 'Too large resource version: 9319, current: 9314', details: { retryAfterSeconds: 1 } };
    const kube = await fakeKube({
      '/api/v1/pods': (req, res, n) => (n === 1 ? once({ type: 'ERROR', object: lagging })(req, res, n) : stream({ type: 'ADDED', object: pod('a', '11') })(req, res, n)),
    });
    const s = await (await gateway(kube.config)).open('pods:9319:/api/v1/pods');
    await s.until((l) => l.some((x) => x.type === 'ADDED'));
    expect(s.types()).toEqual(['OPEN', 'RETRY', 'OPEN', 'ADDED']);
    expect(s.lines[1]).toMatchObject({ error: { code: 'kube_error', message: 'Too large resource version: 9319, current: 9314' } });
    expect(gaps(kube.of('/api/v1/pods').map((r) => r.at))[0]).toBeGreaterThanOrEqual(950);
  });

  it('waits at least as long as the server says, beyond its own longest wait', async () => {
    const busy = { kind: 'Status', code: 429, reason: 'TooManyRequests', details: { retryAfterSeconds: 1 } };
    const kube = await fakeKube({
      '/api/v1/pods': (req, res, n) => (n === 1 ? res.writeHead(429).end(JSON.stringify(busy)) : stream()(req, res, n)),
      '/api/v1/nodes': (req, res, n) => (n === 1 ? res.writeHead(503, { 'retry-after': '1' }).end() : stream()(req, res, n)),
    });
    const s = await (await gateway(kube.config, { maxRetryMs: 100, jitter: 0.5 })).open('pods::/api/v1/pods', 'nodes::/api/v1/nodes');
    await s.until((l) => l.filter((x) => x.type === 'OPEN').length === 2, 4000);
    for (const path of ['/api/v1/pods', '/api/v1/nodes']) expect(gaps(kube.of(path).map((r) => r.at))[0], path).toBeGreaterThanOrEqual(950);
  });

  it('waits for the cluster when there is none yet, and goes on when it comes', async () => {
    const kube = await fakeKube({ '/api/v1/pods': stream({ type: 'ADDED', object: pod('a', '11') }) });
    const missing = join(mkdtempSync(join(tmpdir(), 'ok-')), 'kubeconfig');
    const s = await (await gateway(missing)).open('pods::/api/v1/pods');
    await s.until((l) => l.some((x) => x.type === 'RETRY'));
    expect(s.lines[0]).toMatchObject({ w: 'pods', type: 'RETRY', error: { code: 'kube_down' } });
    kubeconfigFor(`http://127.0.0.1:${kube.port}`, missing);
    await s.until((l) => l.some((x) => x.type === 'ADDED'));
  });

  describe('bookmarks', () => {
    const refusing: Handler = (req, res, n) => {
      if (new URL(req.url ?? '', 'http://kube').searchParams.has('allowWatchBookmarks')) {
        once({ type: 'ERROR', object: { kind: 'Status', code: 500, reason: 'InternalError', message: 'the required storage feature RequestWatchProgress is disabled' } })(
          req,
          res,
          n,
        );
      } else stream({ type: 'ADDED', object: pod('a', '11') })(req, res, n);
    };

    it('are asked without once the cluster says it has none (KubeSolo), without telling the client', async () => {
      const kube = await fakeKube({ '/api/v1/pods': refusing });
      const c = await gateway(kube.config);
      const s = await c.open('pods:10:/api/v1/pods');
      await s.until((l) => l.some((x) => x.type === 'ADDED'));
      expect(s.types()).toEqual(['OPEN', 'OPEN', 'ADDED']);
      expect(kube.requests.map((r) => r.query.has('allowWatchBookmarks'))).toEqual([true, false]);
      const again = await c.open('more:11:/api/v1/pods');
      await again.until((l) => l.some((x) => x.type === 'ADDED'));
      expect(kube.requests.at(-1)?.query.has('allowWatchBookmarks')).toBe(false);
    });

    it('are remembered as refused per cluster, and asked for again after a while', async () => {
      const refuses = await fakeKube({ '/api/v1/pods': refusing });
      const takes = await fakeKube({ '/api/v1/pods': stream() });
      const s = await (await gateway(refuses.config, { bookmarkRetryMs: 200 })).open('pods::/api/v1/pods');
      await s.until((l) => l.some((x) => x.type === 'ADDED'));
      const other = await (await gateway(takes.config)).open('pods::/api/v1/pods');
      await other.until((l) => l.some((x) => x.type === 'OPEN'));
      expect(takes.requests[0].query.has('allowWatchBookmarks')).toBe(true); // another cluster: asked with them
      await new Promise((r) => setTimeout(r, 250));
      const later = await (await gateway(refuses.config, { bookmarkRetryMs: 200 })).open('later::/api/v1/pods');
      await later.until((l) => l.some((x) => x.type === 'ADDED'));
      expect(refuses.requests.at(-2)?.query.has('allowWatchBookmarks')).toBe(true); // tried with them again
    });
  });

  describe('a slow client', () => {
    const big = { type: 'ADDED', object: { kind: 'Secret', metadata: { name: 'x', resourceVersion: '1' }, data: { blob: 'x'.repeat(64 * 1024) } } };

    /** A watch writing big events as fast as the gateway takes them; how much it has written, and when it was first held. */
    function flood() {
      const held = { at: 0, written: 0 };
      const handler: Handler = (_req, res) => {
        res.writeHead(200);
        res.flushHeaders();
        const pump = () => {
          for (;;) {
            if (res.destroyed) return;
            held.written++;
            if (!res.write(line(big))) break;
          }
          held.at ||= Date.now();
          res.once('drain', pump);
        };
        pump();
      };
      return { held, handler };
    }

    it('is waited for: the watches stop reading from the API server while it does not read', async () => {
      const { held, handler } = flood();
      const kube = await fakeKube({ '/api/v1/secrets': handler });
      const c = await gateway(kube.config, { maxBufferBytes: 64 * 1024 * 1024, slowClientMs: 60_000 });
      const res = await new Promise<IncomingMessage>((r) => get(c.url('s::/api/v1/secrets'), r));
      res.pause(); // reads nothing
      await expect.poll(() => held.at, { timeout: 3000 }).toBeGreaterThan(0);
      // Held, and staying held: the gateway takes nothing more while its client reads nothing.
      await new Promise((r) => setTimeout(r, 300));
      const stalled = held.written;
      await new Promise((r) => setTimeout(r, 300));
      expect(held.written).toBe(stalled);
      // The client reads again: so does the gateway.
      res.resume();
      await expect.poll(() => held.written, { timeout: 3000 }).toBeGreaterThan(stalled);
      res.destroy();
    });

    it('is let go when it reads nothing for a while, however little is waiting (the default buffer)', async () => {
      const { handler } = flood();
      const kube = await fakeKube({ '/api/v1/secrets': handler });
      const c = await gateway(kube.config, { pingMs: 30, slowClientMs: 150 });
      const res = await new Promise<IncomingMessage>((r) => get(c.url('s::/api/v1/secrets'), r));
      res.pause();
      // Its watches go, though far less than maxBufferBytes is waiting.
      await expect.poll(() => watchTotals(), { timeout: 2000 }).toMatchObject({ streams: 0, channels: 0 });
      await expect.poll(() => kube.requests.every((r) => r.closed), { timeout: 2000 }).toBe(true);
      res.destroy();
    });

    it('is let go when it stays behind: CLOSE after what it had not read, and the watches end', async () => {
      const { handler } = flood();
      const kube = await fakeKube({ '/api/v1/secrets': handler });
      // Held back at once, the buffer stays small: one event over a limit of 1 KB is behind enough.
      const c = await gateway(kube.config, { pingMs: 50, maxBufferBytes: 1024, slowClientMs: 200 });
      const res = await new Promise<IncomingMessage>((r) => get(c.url('s::/api/v1/secrets'), r));
      res.pause();
      await new Promise((r) => setTimeout(r, 500));
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        text += chunk;
      });
      res.resume();
      await new Promise((r) => res.on('end', r));
      expect(text.trimEnd().split('\n').at(-1)).toBe('{"type":"CLOSE","reason":"slow_client"}');
      await expect.poll(() => kube.requests.every((r) => r.closed), { timeout: 2000 }).toBe(true);
      expect(watchTotals()).toMatchObject({ streams: 0, channels: 0 });
    });
  });

  it('drops every upstream watch when the client leaves, and counts them out', async () => {
    const kube = await fakeKube({ '/api/v1/pods': stream(), '/api/v1/nodes': stream() });
    const s = await (await gateway(kube.config)).open('pods::/api/v1/pods', 'nodes::/api/v1/nodes');
    await s.until((l) => l.filter((x) => x.type === 'OPEN').length === 2);
    expect(watchTotals()).toMatchObject({ streams: 1, channels: 2 });
    s.abort();
    await expect.poll(() => kube.requests.every((r) => r.closed), { timeout: 2000 }).toBe(true);
    await expect.poll(() => watchTotals().channels).toBe(0);
  });

  it('keeps to its budget of watches over every stream', async () => {
    const kube = await fakeKube({ '/api/v1/pods': stream(), '/api/v1/nodes': stream() });
    const c = await gateway(kube.config, { maxChannels: 2 });
    const first = await c.open('pods::/api/v1/pods', 'nodes::/api/v1/nodes');
    await first.until((l) => l.filter((x) => x.type === 'OPEN').length === 2);
    const refused = await fetch(c.url('more::/api/v1/pods'));
    expect(refused.status).toBe(503);
    expect((await refused.json()).error.code).toBe('too_many_watches');
    first.abort();
    await expect.poll(() => watchTotals().channels).toBe(0);
    const later = await c.open('more::/api/v1/pods');
    await later.until((l) => l.some((x) => x.type === 'OPEN'));
  });

  it('counts a watch out of the budget as soon as it is over, though its stream goes on', async () => {
    const kube = await fakeKube({ '/api/v1/pods': stream() });
    const s = await (await gateway(kube.config)).open('pods::/api/v1/pods', 'gone::/apis/example.com/v1/things');
    await s.until((l) => l.some((x) => x.type === 'ERROR') && l.some((x) => x.type === 'OPEN'));
    expect(watchTotals()).toMatchObject({ streams: 1, channels: 1 });
  });

  it('sends a ping now and then', async () => {
    const kube = await fakeKube({ '/api/v1/pods': stream() });
    const s = await (await gateway(kube.config, { pingMs: 30 })).open('pods::/api/v1/pods');
    await s.until((l) => l.some((x) => x.type === 'PING'));
  });

  it('passes the selectors on', async () => {
    const kube = await fakeKube({ '/api/v1/pods': stream() });
    const s = await (await gateway(kube.config)).open('web::/api/v1/pods?labelSelector=app%3Dweb');
    await s.until((l) => l.some((x) => x.type === 'OPEN'));
    expect(kube.requests[0].query.get('labelSelector')).toBe('app=web');
  });

  it('answers a bad request with 400 and why, asking the API server nothing', async () => {
    const kube = await fakeKube({});
    const res = await fetch((await gateway(kube.config)).url('v::/version'));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('bad_watch');
    expect(kube.requests).toHaveLength(0);
  });
});

describe('watch: the review’s', () => {
  it('ends a stream whose watches are all over, keeping nothing open for it', async () => {
    const kube = await fakeKube({ '/api/v1/secrets': (_req, res) => res.writeHead(403).end('{"kind":"Status","code":403,"reason":"Forbidden"}') });
    const s = await (await gateway(kube.config)).open('s::/api/v1/secrets');
    await s.until((l) => l.some((x) => x.type === 'ERROR'));
    await expect.poll(() => watchTotals().streams).toBe(0);
  });

  it('keeps to its budget of streams', async () => {
    const kube = await fakeKube({ '/api/v1/pods': stream() });
    const g = await gateway(kube.config, { maxStreams: 1 });
    await (await g.open('a::/api/v1/pods')).until((l) => l.some((x) => x.type === 'OPEN'));
    const res = await fetch(g.url('b::/api/v1/pods'));
    expect([res.status, (await res.json()).error.code]).toEqual([503, 'too_many_watches']);
  });

  it('does not start from the shortest wait again for one event before each error', async () => {
    const kube = await fakeKube({
      '/api/v1/pods': (_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write(line({ type: 'ADDED', object: pod('a', '1') }));
        res.end(line({ type: 'ERROR', object: { kind: 'Status', code: 504, message: 'busy' } }));
      },
    });
    await (await gateway(kube.config, { retryMs: 20, minLifetimeMs: 1000 })).open('p::/api/v1/pods');
    await new Promise((r) => setTimeout(r, 400));
    // 20, 40, 80, 160 ms: about 5 tries in 400 ms — not one every 20 ms.
    expect(kube.of('/api/v1/pods').length).toBeLessThan(8);
  });

  it('takes no whole event longer than its limit, in bytes', async () => {
    const kube = await fakeKube({ '/api/v1/pods': stream({ type: 'ADDED', object: { ...pod('a', '1'), data: 'é'.repeat(600) } }) });
    const s = await (await gateway(kube.config, { maxLineBytes: 1000 })).open('p::/api/v1/pods');
    await s.until((l) => l.some((x) => x.type === 'RETRY'));
    expect(s.lines.some((x) => x.type === 'ADDED')).toBe(false);
  });

  it('opens nothing for an answer already gone', async () => {
    const kube = await fakeKube({ '/api/v1/pods': stream() });
    const srv = createServer((req, res) => {
      res.destroy();
      watch({ url: req.url ?? '' }, res, { upstream: fromKubeconfig(kube.config), ...FAST });
    });
    const port = await listen(srv);
    await fetch(`http://127.0.0.1:${port}/watch?w=p::/api/v1/pods`).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 50));
    expect(kube.requests).toHaveLength(0);
  });
});
