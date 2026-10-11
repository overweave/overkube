import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGateway, fromKubeconfig, type Gateway } from '@overkube/gateway';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createClient } from './client.ts';
import { kindOf } from './testing.ts';

/*
 * The client against the real gateway (over a fake API server): what one
 * sends the other takes, and the other way — the watch's ids and versions,
 * the gateway's header, its CLOSE when it stops.
 */

const Pod = kindOf('', 'v1', 'Pod', 'pods');
/** A kind whose id is longer than the gateway takes on a stream. */
const Long = kindOf(`${'a-very-long-group-name.'.repeat(4)}example.com`, 'v1', 'Thing', 'things', false);

let api: Server;
let gateway: Gateway;
let base: string;
const servers: Server[] = [];
/** What the API server was asked, and the watches open on it, by path. */
const asked: string[] = [];
const watching = new Map<string, ServerResponse[]>();
let version = 10;

const listen = async (srv: Server) => {
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  servers.push(srv);
  return (srv.address() as AddressInfo).port;
};

/** Discovery of the kinds the fake serves, as the API server gives it. */
function discovery(core: boolean) {
  const kinds = [Pod, Long].filter((k) => (k.group === '') === core);
  return {
    kind: 'APIGroupDiscoveryList',
    items: kinds.map((k) => ({
      metadata: core ? {} : { name: k.group },
      versions: [
        {
          version: k.version,
          resources: [{ resource: k.plural, responseKind: { kind: k.kind }, scope: k.namespaced ? 'Namespaced' : 'Cluster', verbs: ['get', 'list', 'watch'] }],
        },
      ],
    })),
  };
}

beforeAll(async () => {
  api = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '', 'http://kube');
    asked.push(`${req.method} ${url.pathname}${url.searchParams.get('watch') ? '?watch' : ''}`);
    res.writeHead(200, { 'content-type': 'application/json' });
    if (url.pathname === '/api' || url.pathname === '/apis') return res.end(JSON.stringify(discovery(url.pathname === '/api')));
    if (url.searchParams.get('watch')) {
      res.flushHeaders();
      watching.set(url.pathname, [...(watching.get(url.pathname) ?? []), res]);
      return;
    }
    if (req.method === 'PATCH') return res.end(JSON.stringify({ kind: 'Pod', metadata: { name: 'web', resourceVersion: String(++version) } }));
    res.end(JSON.stringify({ kind: 'List', metadata: { resourceVersion: String(version) }, items: [] }));
  });
  const kubeconfig = join(mkdtempSync(join(tmpdir(), 'ok-')), 'kubeconfig');
  writeFileSync(
    kubeconfig,
    `clusters:\n- cluster:\n    server: http://127.0.0.1:${await listen(api)}\n  name: c\ncontexts:\n- context:\n    cluster: c\n  name: x\ncurrent-context: x\n`,
  );
  gateway = createGateway({ upstream: fromKubeconfig(kubeconfig), prefix: '/kube', watch: { pingMs: 50 } });
  base = `http://127.0.0.1:${await listen(createServer((req, res) => void gateway.handle(req, res)))}/kube`;
});

afterAll(() => {
  for (const s of servers) s.close();
});

const clients: Client[] = [];
afterEach(() => {
  for (const c of clients.splice(0)) c.close();
});

/** An event on every watch the API server has open for a path. */
function emit(path: string, event: object) {
  for (const res of watching.get(path) ?? []) if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
}

function client() {
  const c = createClient({ api: { base }, stream: { debounceMs: 5, retryMs: 20, jitter: 0 } });
  clients.push(c);
  return c;
}

describe('the client over the real gateway', () => {
  it('lists, then watches through /watch: an event the API server sends reaches the page', async () => {
    const c = client();
    const pods = c.store.use(Pod);
    await expect.poll(() => pods.state.value).toBe('live');
    await expect.poll(() => (watching.get('/api/v1/pods') ?? []).length).toBeGreaterThan(0);
    emit('/api/v1/pods', { type: 'ADDED', object: { kind: 'Pod', metadata: { name: 'web', namespace: 'shop', resourceVersion: String(++version) } } });
    await expect.poll(() => [...pods.items.value.keys()]).toEqual(['shop/web']);
  });

  it('watches a kind whose id is longer than a stream takes, under a short one', async () => {
    const c = client();
    const things = c.store.use(Long);
    await expect.poll(() => things.state.value).toBe('live');
    const path = `/apis/${Long.group}/v1/things`;
    await expect.poll(() => (watching.get(path) ?? []).length).toBeGreaterThan(0);
    emit(path, { type: 'ADDED', object: { kind: 'Thing', metadata: { name: 't', resourceVersion: String(++version) } } });
    await expect.poll(() => [...things.items.value.keys()]).toEqual(['t']);
  });

  it('changes an object through /patch, its header and its JSON as the gateway asks', async () => {
    const c = client();
    const answer = await c.api.patch({ path: '/api/v1/namespaces/shop/pods/web', type: 'merge', patch: { metadata: { labels: { a: 'b' } } } });
    expect(answer.metadata?.name).toBe('web');
    expect(asked).toContain('PATCH /api/v1/namespaces/shop/pods/web');
  });

  it('opens its stream again when the gateway stops (CLOSE: shutdown), and goes on', async () => {
    const c = client();
    const pods = c.store.use(Pod);
    await expect.poll(() => pods.state.value).toBe('live');
    const before = asked.filter((a) => a === 'GET /api/v1/pods?watch').length;
    gateway.close();
    await expect.poll(() => asked.filter((a) => a === 'GET /api/v1/pods?watch').length).toBeGreaterThan(before);
    await expect.poll(() => pods.state.value).toBe('live');
  });
});
