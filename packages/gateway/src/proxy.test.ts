import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type ProxyOptions, proxy } from './proxy.ts';
import { fromKubeconfig } from './upstream.ts';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function listen(srv: Server): Promise<number> {
  servers.push(srv);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return (srv.address() as AddressInfo).port;
}

/** A kubeconfig for a server (plain HTTP in tests) with a token user. */
function kubeconfig(server: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'ok-')), 'kubeconfig');
  writeFileSync(
    file,
    `clusters:
- cluster:
    server: ${server}
  name: c
contexts:
- context:
    cluster: c
    user: u
  name: x
current-context: x
users:
- name: u
  user:
    token: the-token
`,
  );
  return file;
}

/** A fake API server; returns the kubeconfig that points at it. */
async function fakeApiServer(handler: (req: IncomingMessage, body: string, res: ServerResponse) => void): Promise<string> {
  const srv = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => handler(req, body, res));
  });
  return kubeconfig(`http://127.0.0.1:${await listen(srv)}`);
}

/** The gateway side: an HTTP server whose every request goes through proxy(). */
async function gateway(config: string, options: Partial<ProxyOptions> = {}): Promise<string> {
  const srv = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => proxy({ method: req.method ?? 'GET', url: req.url ?? '', headers: req.headers, body }, res, { upstream: fromKubeconfig(config), ...options }));
  });
  return `http://127.0.0.1:${await listen(srv)}`;
}

describe('proxy', () => {
  it('forwards method, path, query and body with the kubeconfig credentials; returns status and body', async () => {
    let seen: Record<string, unknown> = {};
    const config = await fakeApiServer((req, body, res) => {
      seen = { method: req.method, url: req.url, body, authorization: req.headers.authorization, cookie: req.headers.cookie };
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end('{"kind":"Namespace"}');
    });

    const res = await fetch(`${await gateway(config)}/api/v1/namespaces?fieldManager=overkube`, {
      method: 'POST',
      body: '{"metadata":{"name":"a"}}',
      headers: { cookie: 'session=secret', 'content-type': 'application/json', authorization: 'Bearer the-page-session' },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ kind: 'Namespace' });
    expect(seen).toEqual({
      method: 'POST',
      url: '/api/v1/namespaces?fieldManager=overkube',
      body: '{"metadata":{"name":"a"}}',
      authorization: 'Bearer the-token', // the kubeconfig's, not the client's
      cookie: undefined,
    });
  });

  it('passes on the OpenAPI v3 schemas', async () => {
    let url = '';
    const config = await fakeApiServer((req, _body, res) => {
      url = req.url ?? '';
      res.end('{}');
    });
    const res = await fetch(`${await gateway(config)}/openapi/v3/apis/apps/v1?hash=abc`);
    expect(res.status).toBe(200);
    expect(url).toBe('/openapi/v3/apis/apps/v1?hash=abc');
  });

  it('passes API server errors through with their status', async () => {
    const config = await fakeApiServer((_req, _body, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"kind":"Status","reason":"NotFound"}');
    });
    const res = await fetch(`${await gateway(config)}/api/v1/namespaces/nope`);
    expect(res.status).toBe(404);
    expect((await res.json()).reason).toBe('NotFound');
  });

  it('streams a followed log as it is written', async () => {
    let release!: () => void;
    const config = await fakeApiServer((_req, _body, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"type":"ADDED"}\n');
      release = () => res.end('{"type":"DELETED"}\n');
    });
    const res = await fetch(`${await gateway(config)}/api/v1/namespaces/a/pods/b/log?follow=true`);
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('ADDED'); // arrived before the API server finished
    release();
    let rest = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      rest += new TextDecoder().decode(value);
    }
    expect(rest).toContain('DELETED');
  });

  it('drops the upstream request when the client leaves', async () => {
    let upstreamClosed = false;
    const config = await fakeApiServer((req, _body, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"type":"ADDED"}\n');
      req.socket.on('close', () => (upstreamClosed = true));
    });
    const controller = new AbortController();
    const res = await fetch(`${await gateway(config)}/api/v1/namespaces/a/pods/b/log?follow=true`, { signal: controller.signal });
    await res.body!.getReader().read();
    controller.abort();
    await expect.poll(() => upstreamClosed, { timeout: 2000 }).toBe(true);
  });

  it('says the cluster is down when the API server does not answer', async () => {
    const port = await listen(createServer());
    await new Promise((r) => servers.pop()!.close(r)); // a port nobody listens on
    const res = await fetch(`${await gateway(kubeconfig(`http://127.0.0.1:${port}`))}/version`);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('kube_down');
  });

  it('says the cluster is down when there is no kubeconfig', async () => {
    const res = await fetch(`${await gateway(join(tmpdir(), 'no-such-kubeconfig'))}/version`);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('kube_down');
  });

  it('refuses paths outside the Kubernetes API and unknown methods', async () => {
    const base = await gateway(join(tmpdir(), 'unused'));
    for (const path of ['/etc/passwd', '/api/../healthz', '/healthz', '/v1/status', '/openapi/v2', '/openapi', '/apis/..%2F..%2Fhealthz', '/api/%2e%2e/healthz']) {
      const res = await fetch(base + path);
      expect(res.status, path).toBe(400);
    }
    const res = await fetch(`${base}/api/v1/pods`, { method: 'OPTIONS' });
    expect(res.status).toBe(405);
  });

  it('sends PATCH to /patch', async () => {
    const res = await fetch(`${await gateway(join(tmpdir(), 'unused'))}/api/v1/namespaces/a`, { method: 'PATCH', body: '{}' });
    expect(res.status).toBe(405);
    expect((await res.json()).error.message).toMatch(/\/patch/);
  });

  it('never passes on what reaches past the API server: proxy, exec, attach, portforward', async () => {
    const base = await gateway(join(tmpdir(), 'unused'));
    for (const path of [
      '/api/v1/nodes/kube/proxy/healthz',
      '/api/v1/namespaces/m/pods/p/exec',
      '/api/v1/namespaces/m/pods/p/attach',
      '/api/v1/namespaces/m/pods/p/portforward',
      '/api/v1/namespaces/m/services/s:80/proxy/',
    ]) {
      for (const method of ['GET', 'POST']) {
        const res = await fetch(base + path, { method, body: method === 'POST' ? '{}' : undefined });
        expect(res.status, `${method} ${path}`).toBe(400);
      }
    }
  });

  it("passes a pod's log on", async () => {
    let url = '';
    const config = await fakeApiServer((req, _body, res) => {
      url = req.url ?? '';
      res.end('a line');
    });
    const res = await fetch(`${await gateway(config)}/api/v1/namespaces/media/pods/web/log?tailLines=10`);
    expect(await res.text()).toBe('a line');
    expect(url).toBe('/api/v1/namespaces/media/pods/web/log?tailLines=10');
  });

  it('answers HEAD as GET without the body', async () => {
    let method = '';
    const config = await fakeApiServer((req, _body, res) => {
      method = req.method ?? '';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"kind":"PodList"}');
    });
    const res = await fetch(`${await gateway(config)}/api/v1/pods`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.text()).toBe('');
    expect(method).toBe('GET');
  });

  it('gives up on an API server that does not answer (504)', async () => {
    const config = await fakeApiServer(() => {});
    const res = await fetch(`${await gateway(config, { connectTimeoutMs: 100 })}/version`);
    expect(res.status).toBe(504);
    expect((await res.json()).error.code).toBe('kube_timeout');
  });

  it('cuts an answer that stops coming, but not a followed log', async () => {
    const config = await fakeApiServer((_req, _body, res) => {
      res.writeHead(200);
      res.write('{"kind":');
    });
    const base = await gateway(config, { idleTimeoutMs: 100 });
    const plain = await fetch(`${base}/api/v1/pods`);
    expect(plain.headers.get('x-accel-buffering')).toBeNull();
    await expect(plain.text()).rejects.toThrow();
    // Each way the API server takes the flag.
    for (const query of ['follow=true', 'follow=1', 'follow=True', 'follow=t']) {
      const stream = await fetch(`${base}/api/v1/namespaces/a/pods/b/log?${query}`);
      expect(stream.headers.get('x-accel-buffering'), query).toBe('no');
      const reader = stream.body?.getReader();
      const first = await reader?.read();
      const later = await Promise.race([reader?.read(), new Promise((r) => setTimeout(() => r('still open'), 200))]);
      expect(new TextDecoder().decode(first?.value)).toBe('{"kind":');
      expect(later, query).toBe('still open');
      await reader?.cancel();
    }
  });

  it("breaks the client's answer off when the API server breaks off", async () => {
    const config = await fakeApiServer((_req, _body, res) => {
      res.writeHead(200);
      res.write('{"items":[');
      setTimeout(() => res.socket?.destroy(), 20);
    });
    await expect((await fetch(`${await gateway(config)}/api/v1/pods`)).text()).rejects.toThrow();
  });

  it('serialises a body the framework already parsed as JSON', async () => {
    let seen = '';
    const config = await fakeApiServer((_req, body, res) => {
      seen = body;
      res.end('{}');
    });
    const srv = createServer((_req, res) => proxy({ method: 'PUT', url: '/api/v1/namespaces/a', headers: {}, body: { a: 1 } }, res, { upstream: fromKubeconfig(config) }));
    await fetch(`http://127.0.0.1:${await listen(srv)}/`);
    expect(seen).toBe('{"a":1}');
  });
});
