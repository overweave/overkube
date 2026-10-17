import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { AddressInfo } from 'node:net';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type Config, LOOPBACK_NAMES } from './config.ts';
import { PAGE_HEADERS, type Running, startServer } from './server.ts';
import { testCertificate } from './testing.ts';

/*
 * The server over real HTTP, a fake API server behind it: health, the
 * gateway under its prefix, the page and its routes, HTTPS with its
 * certificate, and stopping with a watch still open.
 */

let api: Server;
let kubeconfig: string;
let ui: string;
const running: Running[] = [];

beforeAll(async () => {
  api = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/version') return res.end('{"gitVersion":"v1.35.7"}');
    if (req.url?.includes('watch=1')) return void res.write(`${JSON.stringify({ type: 'ADDED', object: { metadata: { resourceVersion: '2' } } })}\n`);
    res.end('{"kind":"PodList","items":[]}');
  });
  await new Promise<void>((r) => api.listen(0, '127.0.0.1', r));
  kubeconfig = join(mkdtempSync(join(tmpdir(), 'ok-')), 'kubeconfig');
  writeFileSync(
    kubeconfig,
    `clusters:\n- cluster:\n    server: http://127.0.0.1:${(api.address() as AddressInfo).port}\n  name: c\ncontexts:\n- context:\n    cluster: c\n  name: x\ncurrent-context: x\n`,
  );
  ui = mkdtempSync(join(tmpdir(), 'ok-ui-'));
  writeFileSync(join(ui, 'index.html'), '<p>page</p>');
  mkdirSync(join(ui, 'assets'));
  writeFileSync(join(ui, 'assets', 'app.js'), 'export {};');
  return () => api.close();
});

afterEach(async () => {
  for (const r of running.splice(0)) await r.close(100);
});

async function start(config: Partial<Config> = {}, log: (m: string) => void = () => {}) {
  const r = await startServer(
    {
      host: '127.0.0.1',
      port: 0,
      prefix: '/kube',
      readOnly: false,
      cluster: { from: 'kubeconfig', path: kubeconfig },
      hosts: LOOPBACK_NAMES,
      local: true,
      auth: { mode: 'loopback' },
      ...config,
    },
    { version: '0.1.0', log },
  );
  running.push(r);
  return r.url;
}

describe('the server', () => {
  it('answers its health: the process, and whether the cluster answers — not what it says', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/healthz`)).text()).toBe('ok');
    const ready = await fetch(`${base}/readyz`);
    expect([ready.status, await ready.text()]).toEqual([200, 'ok']);
    const nowhere = await start({ cluster: { from: 'kubeconfig', path: join(tmpdir(), 'no-such-kubeconfig') } });
    expect((await fetch(`${nowhere}/readyz`)).status).toBe(503);
  });

  it('serves the gateway under its prefix, its version told', async () => {
    const base = await start();
    expect((await (await fetch(`${base}/kube/api/v1/pods`)).json()).kind).toBe('PodList');
    expect(await (await fetch(`${base}/kube/status`)).json()).toEqual({ version: '0.1.0', kube: { reachable: true, version: 'v1.35.7' } });
  });

  it('serves the page: its files, index.html for its own routes, nothing outside its folder', async () => {
    const base = await start({ ui });
    const asset = await fetch(`${base}/assets/app.js`);
    expect([asset.headers.get('content-type'), await asset.text()]).toEqual(['text/javascript; charset=utf-8', 'export {};']);
    // Its own origin only: nothing from elsewhere, nothing inline, framed by none but itself.
    expect([asset.headers.get('content-security-policy'), asset.headers.get('referrer-policy'), asset.headers.get('cross-origin-opener-policy')]).toEqual([
      PAGE_HEADERS['content-security-policy'],
      'no-referrer',
      'same-origin',
    ]);
    expect(PAGE_HEADERS['content-security-policy']).toMatch(/default-src 'none'.*script-src 'self'; style-src 'self';.*connect-src 'self'.*frame-ancestors 'self'/);
    const route = await fetch(`${base}/pods/web`);
    expect([route.headers.get('cache-control'), await route.text()]).toEqual(['no-cache', '<p>page</p>']);
    // A file beside the folder, known: asked for by way of "..", it is not given.
    const outside = join(ui, '..', `ok-outside-${Date.now()}`);
    writeFileSync(outside, 'OUTSIDE');
    const climbed = await fetch(`${base}/..%2f${outside.split('/').pop()}`);
    expect([climbed.status, await climbed.text()]).toEqual([404, '']);
    expect((await fetch(`${base}/%E0%A4%A`)).status).toBe(400);
  });

  it('with no page, says where the gateway is', async () => {
    const res = await fetch(`${await start()}/`);
    expect([res.status, await res.text()]).toEqual([404, 'overkube: no page here (OVERKUBE_UI); the gateway is at /kube']);
  });

  it('stops even with a stream open', async () => {
    const r = await startServer(
      {
        host: '127.0.0.1',
        hosts: LOOPBACK_NAMES,
        local: true,
        auth: { mode: 'loopback' },
        port: 0,
        prefix: '/kube',
        readOnly: false,
        cluster: { from: 'kubeconfig', path: kubeconfig },
      },
      { log: () => {} },
    );
    const res = await fetch(`${r.url}/kube/stream`);
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    const started = Date.now();
    await r.close(100);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('serves nothing a link inside its folder points to outside it, and no hidden file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ok-ui-'));
    writeFileSync(join(dir, 'index.html'), '<p>page</p>');
    writeFileSync(join(dir, '.env'), 'SECRET=1');
    const away = mkdtempSync(join(tmpdir(), 'ok-away-'));
    writeFileSync(join(away, 'secret.txt'), 'OUTSIDE');
    symlinkSync(away, join(dir, 'out'));
    const base = await start({ ui: dir });
    const linked = await fetch(`${base}/out/secret.txt`);
    expect([linked.status, await linked.text()]).toEqual([404, '']);
    expect((await fetch(`${base}/.env`)).status).toBe(404);
  });

  it('answers a file that cannot be read, and goes on serving', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ok-ui-'));
    writeFileSync(join(dir, 'index.html'), '<p>page</p>');
    const base = await start({ ui: dir });
    rmSync(join(dir, 'index.html'));
    expect((await fetch(`${base}/pods`)).status).toBe(404);
    expect(await (await fetch(`${base}/healthz`)).text()).toBe('ok');
  });

  it('refuses a request by a name not its own (a DNS rebinding); health is anyone’s', async () => {
    const base = await start({ hosts: ['localhost', '127.0.0.1'] });
    const asked = (path: string, host: string) =>
      new Promise<number>((done, failed) => {
        const out = request(`${base}${path}`, { headers: { host } }, (res) => {
          res.resume();
          done(res.statusCode ?? 0);
        });
        out.on('error', failed);
        out.end();
      });
    expect(await asked('/kube/status', 'evil.example:8080')).toBe(421);
    expect(await asked('/healthz', 'evil.example')).toBe(200);
    expect(await asked('/kube/status', 'localhost:8080')).toBe(200);
  });

  it('serves HTTPS with its certificate, and plain HTTP on its port sent there — health aside', async () => {
    const tls = testCertificate();
    const base = await start({ tls });
    expect(base).toMatch(/^https:\/\/127\.0\.0\.1:\d+$/);
    const plain = base.replace('https:', 'http:');
    const asked = (url: string) =>
      new Promise<[number, string | undefined, string | undefined]>((done, failed) => {
        const out = (url.startsWith('https:') ? httpsRequest : request)(url, { ca: readFileSync(tls.cert), headers: { host: 'localhost' } }, (res) => {
          res.resume();
          done([res.statusCode ?? 0, res.headers.location, res.headers['strict-transport-security']]);
        });
        out.on('error', failed);
        out.end();
      });
    expect(await asked(`${base}/kube/status`)).toEqual([200, undefined, 'max-age=31536000']);
    expect(await asked(`${plain}/kube/status?x=1`)).toEqual([308, 'https://localhost/kube/status?x=1', undefined]);
    expect(await asked(`${plain}/healthz`)).toEqual([200, undefined, undefined]);
  });

  it('cuts a connection that says nothing, or begins a handshake and leaves it: neither holds its close', async () => {
    const r = await startServer(
      {
        host: '127.0.0.1',
        hosts: LOOPBACK_NAMES,
        local: true,
        auth: { mode: 'loopback' },
        port: 0,
        prefix: '/kube',
        readOnly: false,
        cluster: { from: 'kubeconfig', path: kubeconfig },
        tls: testCertificate(),
      },
      { log: () => {} },
    );
    const port = Number(new URL(r.url).port);
    const silent = connect(port, '127.0.0.1');
    await new Promise((done) => silent.once('connect', done));
    // A TLS handshake begun and left: handed over, never ended.
    const begun = connect(port, '127.0.0.1');
    await new Promise((done) => begun.once('connect', done));
    begun.write(Buffer.from([0x16]));
    begun.on('error', () => {});
    const started = Date.now();
    await r.close(100);
    expect(Date.now() - started).toBeLessThan(2000);
    silent.destroy();
    begun.destroy();
  });
});
