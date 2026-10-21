import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
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
/** Whom each request acted as (its Impersonate-User and -Group). */
let acted: { url: string; user?: string[]; groups?: string[]; authorization?: string }[] = [];
/** What the fake API server's /readyz answers; none: 200, as for anything else. */
let readyz: { status: number; body: string } | null = null;
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
      acted.push({ url: req.url ?? '', user: req.headersDistinct['impersonate-user'], groups: req.headersDistinct['impersonate-group'], authorization: req.headers.authorization });
      if (req.url?.startsWith('/readyz') && readyz) return res.writeHead(readyz.status, { 'content-type': 'text/plain' }).end(readyz.body);
      // A workload's answers through the API server's proxy: one saying what it should not be taken for, one too large (said, or not), one refusing.
      if (req.url?.includes('/proxy/headers')) {
        res.writeHead(302, {
          location: '/kube/api/v1/secrets',
          'www-authenticate': 'Basic',
          'content-disposition': 'inline',
          'access-control-allow-origin': '*',
          'x-overkube-error': 'unauthorized',
          'cache-control': 'public, max-age=86400',
        });
        return res.end();
      }
      if (req.url?.includes('/proxy/said-large')) {
        res.writeHead(200, { 'content-length': String(64 * 1024 * 1024) });
        return res.end();
      }
      if (req.url?.includes('/proxy/large')) {
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        return res.end(Buffer.alloc(17 * 1024 * 1024));
      }
      if (req.url?.includes('/proxy/refuse')) {
        res.writeHead(401, { 'content-type': 'text/plain' });
        return res.end('token required');
      }
      // A workload's answer through the API server's proxy: what it was asked, and a cookie it would set.
      if (req.url?.includes('/proxy/')) {
        res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'grafana_session=x; Path=/' });
        return res.end(`<script>${req.method} ${req.url} ${body}</script>`);
      }
      if (req.url === '/apis/authentication.k8s.io/v1/selfsubjectreviews') {
        // Who it is taken for: whom it acts as, else the kubeconfig's.
        const user = req.headers['impersonate-user'] ?? 'kubeconfig-admin';
        const groups = req.headersDistinct['impersonate-group'] ?? [];
        res.writeHead(201, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ kind: 'SelfSubjectReview', status: { userInfo: { username: user, groups: [...groups, 'system:authenticated'] } } }));
      }
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
  acted = [];
  readyz = null;
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

  it('tells an API server still starting (not ready) as not reachable, with what is not done yet', async () => {
    readyz = {
      status: 500,
      body: '[+]ping ok\n[-]poststarthook/rbac/bootstrap-roles failed: reason withheld\n[-]poststarthook/apiservice-registration-controller failed: reason withheld\nreadyz check failed\n',
    };
    const res = await fetch(`${await host()}/status`);
    expect((await res.json()).kube).toEqual({
      reachable: false,
      error: { code: 'kube_error', message: 'the API server is not ready yet: poststarthook/rbac/bootstrap-roles, poststarthook/apiservice-registration-controller' },
    });
  });

  it('takes an API server that does not let /readyz be asked by its version alone', async () => {
    readyz = { status: 403, body: 'forbidden' };
    const res = await fetch(`${await host()}/status`);
    expect((await res.json()).kube).toEqual({ reachable: true, version: 'v1.35.7' });
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
    expect(seen.map((s) => s.method)).toEqual(['GET', 'GET', 'GET']);
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

describe('createGateway: someone signed in', () => {
  const alice = { user: 'alice', groups: ['admins', 'ops'], via: 'token' };
  /** Signed in as the x-who header says (none: no one). */
  const signedIn = () => host({ identify: (req) => (req.headers['x-who'] ? { ...alice, user: String(req.headers['x-who']) } : null) });

  it('acts as them in all it asks the cluster: a read, a change, a /patch, a stream', async () => {
    const base = await signedIn();
    const who = { 'x-who': 'alice' };
    await fetch(`${base}/api/v1/pods`, { headers: who });
    await send(`${base}/api/v1/namespaces`, { method: 'POST', body: '{}', headers: who });
    await send(`${base}/patch`, { method: 'POST', body: JSON.stringify({ path: '/api/v1/namespaces/a', type: 'merge', patch: {} }), headers: who });
    const res = await fetch(`${base}/stream`, { headers: who });
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const name = JSON.parse(new TextDecoder().decode((await reader.read()).value).split('\n')[0]).stream;
    await send(`${base}/stream/${name}`, { method: 'POST', body: JSON.stringify({ add: [{ id: 'p', path: '/api/v1/pods' }] }), headers: who });
    await expect.poll(() => acted.length).toBe(4);
    await reader.cancel();
    expect(acted.map((a) => [a.url.split('?')[0], a.user, a.groups])).toEqual([
      ['/api/v1/pods', ['alice'], ['admins', 'ops']],
      ['/api/v1/namespaces', ['alice'], ['admins', 'ops']],
      ['/api/v1/namespaces/a', ['alice'], ['admins', 'ops']],
      ['/api/v1/pods', ['alice'], ['admins', 'ops']],
    ]);
  });

  it('turns away whoever is not signed in, or cannot be acted as — asking the cluster nothing', async () => {
    const base = await signedIn();
    for (const [path, who] of [
      ['/api/v1/pods', undefined],
      ['/stream', undefined],
      ['/status', undefined],
      ['/me', undefined],
      ['/api/v1/pods', 'system:admin'],
      ['/api/v1/pods', 'bad\tname'],
    ] as const) {
      const res = await fetch(`${base}${path}`, { headers: who ? { 'x-who': who } : {} });
      expect([path, who, res.status, (await res.json()).error.code]).toEqual([path, who, 401, 'unauthorized']);
    }
    const masters = await host({ identify: () => ({ user: 'alice', groups: ['system:masters'] }) });
    expect((await fetch(`${masters}/api/v1/pods`)).status).toBe(401);
    expect(seen).toEqual([]);
  });

  it('says whom the cluster takes the page for: the one signed in, or its credentials', async () => {
    const res = await fetch(`${await signedIn()}/me`, { headers: { 'x-who': 'alice' } });
    expect(await res.json()).toEqual({ user: 'alice', groups: ['admins', 'ops', 'system:authenticated'], via: 'token' });
    const own = await fetch(`${await host()}/me`);
    expect(await own.json()).toEqual({ user: 'kubeconfig-admin', groups: ['system:authenticated'] });
    expect(acted.map((a) => [a.user, a.groups])).toEqual([
      [['alice'], ['admins', 'ops']],
      [undefined, undefined],
    ]);
  });

  it('reaches the cluster with one’s own token: the gateway’s credentials left out, no one impersonated', async () => {
    const base = await host({ identify: () => ({ user: 'system:serviceaccount:ops:viewer', groups: ['system:serviceaccounts'], via: 'token', token: 'the-users-token' }) });
    await fetch(`${base}/api/v1/pods`);
    expect(acted.map((a) => [a.authorization, a.user, a.groups])).toEqual([['Bearer the-users-token', undefined, undefined]]);
  });

  it('ends the streams of one signed out, and only theirs', async () => {
    const gateway = createGateway({ upstream: fromKubeconfig(kubeconfig), identify: (req) => ({ user: String(req.headers['x-who']), groups: [] }) });
    const srv = createServer((req, res) => void gateway.handle(req, res));
    const base = `http://127.0.0.1:${await listen(srv)}`;
    const open = async (who: string) => {
      const reader = ((await fetch(`${base}/stream`, { headers: { 'x-who': who } })).body as ReadableStream<Uint8Array>).getReader();
      await reader.read();
      return reader;
    };
    const [alice, bob] = [await open('alice'), await open('bob')];
    gateway.close({ user: 'alice', groups: [] });
    expect(new TextDecoder().decode((await alice.read()).value)).toBe('{"type":"CLOSE","reason":"shutdown"}\n');
    expect((await alice.read()).done).toBe(true);
    const still = await Promise.race([bob.read().then(() => 'read'), new Promise((r) => setTimeout(() => r('open'), 100))]);
    expect(still).toBe('open');
    await bob.cancel();
  });

  it('keeps a stream its owner’s: to anyone else it is not there', async () => {
    const base = await signedIn();
    const res = await fetch(`${base}/stream`, { headers: { 'x-who': 'alice' } });
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const name = JSON.parse(new TextDecoder().decode((await reader.read()).value).split('\n')[0]).stream;
    const change = (who: string) => send(`${base}/stream/${name}`, { method: 'POST', body: JSON.stringify({ add: [] }), headers: { 'x-who': who } });
    const other = await change('bob');
    expect([other.status, (await other.json()).error.code]).toEqual([404, 'no_stream']);
    expect((await change('alice')).status).toBe(204);
    await reader.cancel();
  });
});

describe('createGateway: a workload’s port, as data', () => {
  const at = '/proxy/services/monitoring/https:prometheus:9090';

  it('reaches it through the API server’s proxy as the one signed in: its path, query and body; its answer as data, never a page', async () => {
    const base = await host({ identify: () => ({ user: 'alice', groups: ['ops'] }) });
    const read = await fetch(`${base}${at}/api/v1/query?query=up`, { headers: { cookie: 'session=secret' } });
    expect([read.status, read.headers.get('content-security-policy'), read.headers.get('x-content-type-options'), read.headers.get('set-cookie')]).toEqual([
      200,
      'sandbox',
      'nosniff',
      null,
    ]);
    expect(await read.text()).toBe('<script>GET /api/v1/namespaces/monitoring/services/https:prometheus:9090/proxy/api/v1/query?query=up </script>');
    await send(`${base}/proxy/pods/trivy/scanner-0:4954/twirp/trivy.scanner.v1.Scanner/Scan`, { method: 'POST', body: '{"target":"nginx"}' });
    expect(seen.at(-1)).toEqual({
      method: 'POST',
      url: '/api/v1/namespaces/trivy/pods/scanner-0:4954/proxy/twirp/trivy.scanner.v1.Scanner/Scan',
      contentType: 'application/json',
      body: '{"target":"nginx"}',
    });
    expect(acted.map((a) => [a.user, a.authorization])).toEqual([
      [['alice'], 'Bearer t'],
      [['alice'], 'Bearer t'],
    ]);
  });

  it('passes back none of what the workload says of more than its answer: a redirect, a challenge, a cache, a CORS grant, the gateway’s own mark', async () => {
    const base = await host();
    const res = await fetch(`${base}${at}/headers`, { redirect: 'manual' });
    expect([
      res.status,
      res.headers.get('location'),
      res.headers.get('www-authenticate'),
      res.headers.get('content-disposition'),
      res.headers.get('access-control-allow-origin'),
      res.headers.get('x-overkube-error'),
      res.headers.get('cache-control'),
      res.headers.get('cross-origin-resource-policy'),
    ]).toEqual([302, null, null, null, null, null, 'no-store', 'same-origin']);
    // Its own refusal, as it is: no mark of the gateway's on it.
    const refused = await fetch(`${base}${at}/refuse`);
    expect([refused.status, refused.headers.get('x-overkube-error'), await refused.text()]).toEqual([401, null, 'token required']);
  });

  it('bounds its answer: one said larger refused before any of it, one larger broken off; HEAD, none of it', async () => {
    const base = await host();
    const said = await fetch(`${base}${at}/said-large`);
    expect([said.status, (await said.json()).error.code]).toEqual([502, 'too_large']);
    const large = await fetch(`${base}${at}/large`);
    await expect(large.arrayBuffer()).rejects.toThrow();
    const head = await fetch(`${base}${at}/metrics`, { method: 'HEAD' });
    expect([head.status, await head.text()]).toEqual([200, '']);
  });

  it('is asked by the page’s code alone: never opened as a page, a frame, an image', async () => {
    const base = await host();
    for (const dest of ['document', 'iframe', 'image', 'script']) {
      const res = await fetch(`${base}${at}/metrics`, { headers: { 'sec-fetch-dest': dest } });
      expect([dest, res.status, res.headers.get('x-overkube-error')]).toEqual([dest, 403, 'not_fetched']);
    }
    expect((await fetch(`${base}${at}/metrics`, { headers: { 'sec-fetch-dest': 'empty' } })).status).toBe(200);
  });

  it('read only: asks it with GET and HEAD alone', async () => {
    const base = await host({ readOnly: true });
    expect((await fetch(`${base}${at}/metrics`)).status).toBe(200);
    const post = await send(`${base}${at}/api`, { method: 'POST', body: '{}' });
    expect([post.status, (await post.json()).error.code]).toEqual([403, 'read_only']);
  });

  it('reaches nothing else: a path that could be cleaned into the API’s, a node’s proxy, a target that is none — asking the cluster nothing', async () => {
    const base = await host();
    for (const path of [
      `${at}/../../secrets`,
      `${at}/%2e%2e/secrets`,
      `${at}/./x`,
      '/proxy/nodes/node-1:10250/pods',
      '/proxy/services/monitoring/prometheus/metrics',
      '/proxy/services/Monitoring/prometheus:9090/',
      '/proxy/services/monitoring/ftp:prometheus:21/',
      '/proxy/services/monitoring/prometheus:9090:extra/',
    ]) {
      // Sent as it is (fetch would clean "." and ".." away itself).
      const answered = await new Promise<[number, unknown]>((done, failed) => {
        const { hostname, port } = new URL(base);
        const out = request({ hostname, port, path }, (res) => {
          res.resume();
          done([res.statusCode ?? 0, res.headers['x-overkube-error']]);
        });
        out.on('error', failed);
        out.end();
      });
      expect([path, ...answered]).toEqual([path, 400, 'bad_path']);
    }
    expect(seen).toEqual([]);
  });
});
