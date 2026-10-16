import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGateway, type GatewayOptions, type Given } from './gateway.ts';
import { fromKubeconfig } from './upstream.ts';
import { resetWatchState } from './watch.ts';

/*
 * The gateway as a host serves it: a plain node:http server, a prefix, its
 * routes, bodies read off the request or given by the host, read only, and
 * what is not its own left to the host.
 */

interface Seen {
  method: string;
  url: string;
  contentType?: string;
  body: string;
}

let api: Server;
let seen: Seen[] = [];
let kubeconfig: string;
const servers: Server[] = [];

const listen = async (srv: Server) => {
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  servers.push(srv);
  return (srv.address() as AddressInfo).port;
};

beforeAll(async () => {
  // A fake API server: what it was asked, a list, a watch that sends one event and stays open, its version.
  api = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', contentType: req.headers['content-type'], body });
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url === '/version') return res.end('{"gitVersion":"v1.35.7"}');
      if (new URL(req.url ?? '', 'http://kube').searchParams.get('watch') === '1') {
        res.write(`${JSON.stringify({ type: 'ADDED', object: { kind: 'Pod', metadata: { name: 'a', resourceVersion: '2' } } })}\n`);
        return;
      }
      res.end(JSON.stringify({ kind: 'PodList', items: [] }));
    });
  });
  const port = await listen(api);
  kubeconfig = join(mkdtempSync(join(tmpdir(), 'ok-')), 'kubeconfig');
  writeFileSync(
    kubeconfig,
    `clusters:\n- cluster:\n    server: http://127.0.0.1:${port}\n  name: c\nusers:\n- name: u\n  user:\n    token: t\ncontexts:\n- context:\n    cluster: c\n    user: u\n  name: x\ncurrent-context: x\n`,
  );
});

afterAll(() => {
  for (const srv of servers) srv.close();
  resetWatchState();
});

beforeEach(() => {
  seen = [];
});

/** A host: the gateway under its options, the rest answered as the host's own (404 "host"); a body given, if any. */
/** A request as the page sends it: the gateway's header, JSON. */
const send = (url: string, init: RequestInit = {}) =>
  fetch(url, { ...init, headers: { 'x-overkube': '1', 'content-type': 'application/json', ...(init.headers as Record<string, string>) } });

async function host(options: Partial<GatewayOptions> = {}, given?: (body: string) => Given) {
  const gateway = createGateway({ upstream: fromKubeconfig(kubeconfig), ...options });
  const srv = createServer((req, res) => {
    if (!given) {
      if (!gateway.handle(req, res)) res.writeHead(404).end('host');
      return;
    }
    let text = '';
    req.on('data', (c) => {
      text += c;
    });
    req.on('end', () => {
      if (!gateway.handle(req, res, given(text))) res.writeHead(404).end('host');
    });
  });
  return `http://127.0.0.1:${await listen(srv)}`;
}

describe('createGateway', () => {
  it('serves under its prefix, and leaves anything else to the host', async () => {
    const base = await host({ prefix: '/kube' });
    const list = await fetch(`${base}/kube/api/v1/pods`);
    expect([list.status, (await list.json()).kind]).toEqual([200, 'PodList']);
    expect(seen.map((s) => s.url)).toEqual(['/api/v1/pods']);
    const other = await fetch(`${base}/index.html`);
    expect([other.status, await other.text()]).toEqual([404, 'host']);
    const lookalike = await fetch(`${base}/kubernetes/api/v1/pods`);
    expect(lookalike.status).toBe(404);
  });

  it('tells its status, with the version it was given', async () => {
    const res = await fetch(`${await host({ version: '0.1.0' })}/status`);
    expect(await res.json()).toEqual({ version: '0.1.0', kube: { reachable: true, version: 'v1.35.7' } });
  });

  it('reads a body off the request: a /patch as JSON, a POST passed on as it came', async () => {
    const base = await host();
    const patched = await send(`${base}/patch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '/apis/apps/v1/namespaces/web/deployments/shop', type: 'merge', patch: { spec: { replicas: 2 } } }),
    });
    expect(patched.status).toBe(200);
    await send(`${base}/api/v1/namespaces`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"metadata":{"name":"a"}}' });
    expect(seen).toEqual([
      {
        method: 'PATCH',
        url: '/apis/apps/v1/namespaces/web/deployments/shop?fieldManager=overkube',
        contentType: 'application/merge-patch+json',
        body: '{"spec":{"replicas":2}}',
      },
      { method: 'POST', url: '/api/v1/namespaces', contentType: 'application/json', body: '{"metadata":{"name":"a"}}' },
    ]);
  });

  it('takes the body a host has read already (a framework that parsed it)', async () => {
    const base = await host({ fieldManager: 'mine' }, (text) => ({ body: JSON.parse(text) }));
    await send(`${base}/patch`, { method: 'POST', body: JSON.stringify({ path: '/api/v1/namespaces/a', type: 'merge', patch: { metadata: {} } }) });
    expect(seen.map((s) => s.url)).toEqual(['/api/v1/namespaces/a?fieldManager=mine']);
  });

  it('says what is wrong with a body: not JSON, too large', async () => {
    const base = await host({ maxBodyBytes: 100 });
    const bad = await send(`${base}/patch`, { method: 'POST', body: 'nope' });
    expect([bad.status, (await bad.json()).error.code]).toEqual([400, 'bad_body']);
    const big = await send(`${base}/api/v1/namespaces`, { method: 'POST', body: 'x'.repeat(1000) });
    expect([big.status, (await big.json()).error.code]).toEqual([413, 'too_large']);
    expect(seen).toEqual([]);
  });

  it('read only: reads and tells its status; changes nothing', async () => {
    const base = await host({ readOnly: true });
    expect((await fetch(`${base}/api/v1/pods`)).status).toBe(200);
    expect((await fetch(`${base}/status`)).status).toBe(200);
    for (const [method, path] of [
      ['POST', '/patch'],
      ['POST', '/api/v1/namespaces'],
      ['PUT', '/api/v1/namespaces/a'],
      ['DELETE', '/api/v1/namespaces/a'],
    ]) {
      const res = await send(`${base}${path}`, { method, body: method === 'DELETE' ? undefined : '{}' });
      expect([method, res.status, (await res.json()).error.code]).toEqual([method, 403, 'read_only']);
    }
    expect(seen.map((s) => s.method)).toEqual(['GET', 'GET']);
  });

  it('never passes on what reaches past the API server, nor PATCH', async () => {
    const base = await host();
    expect((await fetch(`${base}/api/v1/namespaces/a/pods/b/exec`)).status).toBe(400);
    const res = await send(`${base}/api/v1/namespaces/a`, { method: 'PATCH', body: '{}' });
    expect([res.status, (await res.json()).error.message]).toEqual([405, 'PATCH goes through /patch, as JSON']);
    expect(seen).toEqual([]);
  });
});

describe('createGateway: no other site’s page through its visitor’s browser', () => {
  it('refuses what another site’s page sends; anything but a read without its header', async () => {
    const base = await host();
    const cross = await fetch(`${base}/api/v1/pods`, { headers: { 'sec-fetch-site': 'cross-site' } });
    expect([cross.status, (await cross.json()).error.code]).toEqual([403, 'cross_site']);
    const origin = await send(`${base}/api/v1/namespaces`, { method: 'POST', body: '{}', headers: { origin: 'https://evil.example' } });
    expect([origin.status, (await origin.json()).error.code]).toEqual([403, 'cross_site']);
    const bare = await fetch(`${base}/api/v1/namespaces`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
    expect([bare.status, (await bare.json()).error.message]).toEqual([403, 'a request that is not a read carries the x-overkube header']);
    const text = await fetch(`${base}/patch`, { method: 'POST', body: '{}', headers: { 'x-overkube': '1', 'content-type': 'text/plain' } });
    expect(text.status).toBe(415);
    const same = await send(`${base}/api/v1/namespaces`, { method: 'POST', body: '{}', headers: { origin: base, 'sec-fetch-site': 'same-origin' } });
    expect(same.status).toBe(200);
    expect(seen.map((s) => s.method)).toEqual(['POST']);
  });

  it('takes no header when its host keeps other sites out itself', async () => {
    const base = await host({ header: false });
    expect((await fetch(`${base}/api/v1/namespaces`, { method: 'POST', body: '{}' })).status).toBe(200);
  });
});

describe('createGateway: methods, bodies, answers', () => {
  it('asks /stream and /status with GET, /patch with POST', async () => {
    const base = await host();
    for (const [method, path] of [
      ['HEAD', '/status'],
      ['POST', '/stream'],
      ['GET', '/patch'],
    ]) {
      expect([method, path, (await send(`${base}${path}`, { method })).status]).toEqual([method, path, 405]);
    }
  });

  it('holds a body its host gives to its limit; says so of one its host read already and did not give', async () => {
    const big = await host({ maxBodyBytes: 10 }, () => ({ body: 'x'.repeat(100) }));
    expect((await send(`${big}/api/v1/namespaces`, { method: 'POST', body: 'x' })).status).toBe(413);
    const gateway = createGateway({ upstream: fromKubeconfig(kubeconfig) });
    const srv = createServer((req, res) => {
      req.resume();
      req.on('end', () => gateway.handle(req, res));
    });
    const res = await send(`http://127.0.0.1:${await listen(srv)}/api/v1/namespaces`, { method: 'POST', body: '{}' });
    expect([res.status, (await res.json()).error.code]).toEqual([500, 'bad_body']);
    expect(seen).toEqual([]);
  });

  it('passes on no watch, no followed log (/stream is their way)', async () => {
    const base = await host();
    for (const query of ['watch=1', 'follow=true', 'follow=t']) {
      const answer = await fetch(`${base}/api/v1/namespaces/a/pods/b/log?${query}`);
      expect([answer.status, (await answer.json()).error.code], query).toEqual([400, 'bad_stream']);
    }
    expect(seen).toEqual([]);
  });

  it('hardens what it passes back: never sniffed, never a page, kept by no cache', async () => {
    const res = await fetch(`${await host()}/api/v1/pods`);
    expect([res.headers.get('x-content-type-options'), res.headers.get('content-security-policy'), res.headers.get('cache-control')]).toEqual(['nosniff', 'sandbox', 'no-store']);
  });

  it('answers nothing, and asks the cluster nothing, for a client already gone', async () => {
    const gateway = createGateway({ upstream: fromKubeconfig(kubeconfig) });
    let handled: boolean | undefined;
    const srv = createServer((req, res) => {
      res.destroy();
      handled = gateway.handle(req, res);
    });
    await fetch(`http://127.0.0.1:${await listen(srv)}/api/v1/pods`).catch(() => undefined);
    await expect.poll(() => handled).toBe(true);
    expect(seen).toEqual([]);
  });

  it('tells its streams CLOSE (shutdown) when it closes', async () => {
    const gateway = createGateway({ upstream: fromKubeconfig(kubeconfig) });
    const srv = createServer((req, res) => void gateway.handle(req, res));
    const res = await fetch(`http://127.0.0.1:${await listen(srv)}/stream`);
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    let text = '';
    while (!text.includes('HELLO')) text += new TextDecoder().decode((await reader.read()).value);
    gateway.close();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    expect(text.trim().split('\n').at(-1)).toBe('{"type":"CLOSE","reason":"shutdown"}');
  });
});
