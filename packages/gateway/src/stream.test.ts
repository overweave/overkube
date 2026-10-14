import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, request, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGateway, type Gateway, type GatewayOptions } from './gateway.ts';
import type { StreamLine } from './protocol.ts';
import { fromKubeconfig } from './upstream.ts';
import { resetWatchState, watchTotals } from './watch.ts';

/*
 * A changing stream as a page uses it: opened, told HELLO, changed by
 * POSTs — a subscription a watch: a collection, only metadata, from a
 * resourceVersion — and each watch's lines told by f.
 */

const servers: Server[] = [];
const gateways: Gateway[] = [];
afterEach(async () => {
  for (const g of gateways.splice(0)) g.close();
  const closing = servers.splice(0);
  for (const s of closing) s.closeAllConnections();
  await Promise.all(closing.map((s) => new Promise((r) => s.close(r))));
  // Nothing left open, nothing left counted.
  expect(watchTotals()).toMatchObject({ streams: 0, channels: 0 });
  resetWatchState();
});

const listen = async (srv: Server) => {
  servers.push(srv);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return (srv.address() as AddressInfo).port;
};

const until = async (ok: () => boolean) => {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(ok()).toBe(true);
};

/** A fake API server (a watch: one ADDED, kept open; in namespace gone: a 410; in evil: an event with a tag of its own) and a gateway in front of it. */
async function setup(options: Partial<GatewayOptions> = {}) {
  const asked: { path: string; query: URLSearchParams; accept?: string; closed: boolean }[] = [];
  const api = createServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://kube');
    const seen = { path: url.pathname, query: url.searchParams, accept: req.headers.accept, closed: false };
    asked.push(seen);
    req.socket.on('close', () => {
      seen.closed = true;
    });
    if (req.method === 'POST') return res.writeHead(201).end('{"kind":"SelfSubjectRulesReview"}');
    res.writeHead(200, { 'content-type': 'application/json' });
    if (url.pathname.includes('/namespaces/gone/')) return res.end(`${JSON.stringify({ type: 'ERROR', object: { kind: 'Status', code: 410 } })}\n`);
    if (url.pathname.includes('/namespaces/evil/')) return void res.write(`${JSON.stringify({ type: 'ADDED', object: { metadata: { name: 'e' } }, f: 'victim', w: 'other' })}\n`);
    res.write(`${JSON.stringify({ type: 'ADDED', object: { metadata: { name: 'a', resourceVersion: '7', managedFields: [] } } })}\n`);
  });
  const kubeconfig = join(mkdtempSync(join(tmpdir(), 'ok-')), 'kubeconfig');
  writeFileSync(
    kubeconfig,
    `clusters:\n- cluster:\n    server: http://127.0.0.1:${await listen(api)}\n  name: c\nusers:\n- name: u\n  user:\n    token: t\ncontexts:\n- context:\n    cluster: c\n    user: u\n  name: x\ncurrent-context: x\n`,
  );
  const gateway = createGateway({ upstream: fromKubeconfig(kubeconfig), ...options });
  gateways.push(gateway);
  // The /stream answers, as the gateway writes them.
  const answers: ServerResponse[] = [];
  const port = await listen(
    createServer((req, res) => {
      if (req.url === '/stream') answers.push(res);
      gateway.handle(req, res);
    }),
  );

  const post = (path: string, body: unknown, headers: Record<string, string> = { 'x-overkube': '1', 'content-type': 'application/json' }) =>
    new Promise<{ status: number; body: string }>((resolve) => {
      const q = request({ port, path, method: 'POST', headers }, (a) => {
        let b = '';
        a.on('data', (c) => {
          b += c;
        });
        a.on('end', () => resolve({ status: a.statusCode ?? 0, body: b }));
      });
      q.end(JSON.stringify(body));
    });

  /** A stream opened: its lines as they come, its name, a change to it. */
  const open = async () => {
    const lines: StreamLine[] = [];
    let answer: IncomingMessage | undefined;
    const req = request({ port, path: '/stream' }, (a) => {
      answer = a;
      let rest = '';
      a.setEncoding('utf8');
      a.on('data', (chunk: string) => {
        const parts = (rest + chunk).split('\n');
        rest = parts.pop() ?? '';
        for (const p of parts) lines.push(JSON.parse(p));
      });
    });
    req.end();
    await until(() => lines.length > 0);
    const hello = lines[0] as { type: 'HELLO'; stream: string };
    return { lines, name: hello.stream, change: (body: unknown) => post(`/stream/${hello.stream}`, body), leave: () => answer?.destroy() };
  };
  return { asked, answers, open, post };
}

describe('a changing stream', () => {
  it('says its name first, then each subscription’s lines: a collection, in a namespace or every one; metadata only; from where asked', async () => {
    const { asked, open } = await setup();
    const s = await open();
    expect(s.lines[0]).toEqual({ type: 'HELLO', stream: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    const added = await s.change({
      add: [
        { id: 'pods.a', path: '/api/v1/namespaces/a/pods', labelSelector: 'app=web', resourceVersion: '5' },
        { id: 'nodes', path: '/api/v1/nodes', projection: 'metadata' },
      ],
    });
    expect(added.status).toBe(204);
    await until(() => s.lines.filter((l) => l.type === 'ADDED').length === 2);
    expect(s.lines).toContainEqual({ f: 'pods.a', type: 'ADDED', object: { metadata: { name: 'a', resourceVersion: '7' } } });
    expect(s.lines).toContainEqual({ f: 'nodes', type: 'OPEN' });
    expect(asked.map((a) => [a.path, a.query.get('resourceVersion'), a.query.get('labelSelector'), a.accept])).toEqual([
      ['/api/v1/namespaces/a/pods', '5', 'app=web', 'application/json'],
      ['/api/v1/nodes', null, null, 'application/json;as=PartialObjectMetadata;g=meta.k8s.io;v=v1,application/json'],
    ]);
  });

  it('ends a subscription on its 410, the others and the stream going on; removed, it may be subscribed anew', async () => {
    const { open } = await setup();
    const s = await open();
    await s.change({
      add: [
        { id: 'gone', path: '/api/v1/namespaces/gone/pods' },
        { id: 'a', path: '/api/v1/namespaces/a/pods' },
      ],
    });
    await until(() => s.lines.some((l) => l.type === 'ERROR') && s.lines.some((l) => l.type === 'ADDED'));
    expect(s.lines).toContainEqual({ f: 'gone', type: 'ERROR', object: { kind: 'Status', code: 410 } });
    expect(watchTotals().channels).toBe(1);
    expect((await s.change({ remove: ['gone'], add: [{ id: 'gone', path: '/api/v1/namespaces/gone/pods' }] })).status).toBe(204);
  });

  it('tells a subscription removed after its last line, its watch closed; one removed and added in one change, again', async () => {
    const { asked, open } = await setup();
    const s = await open();
    await s.change({ add: [{ id: 'nodes', path: '/api/v1/nodes' }] });
    await until(() => s.lines.some((l) => l.type === 'ADDED'));
    expect((await s.change({ remove: ['nodes', 'never'], add: [{ id: 'nodes', path: '/api/v1/nodes' }] })).status).toBe(204);
    await until(() => s.lines.filter((l) => l.type === 'ADDED').length === 2);
    expect(s.lines.slice(-3).map((l) => l.type)).toEqual(['REMOVED', 'OPEN', 'ADDED']);
    await until(() => asked[0].closed);
    expect(watchTotals().channels).toBe(1);
  });

  it('passes on an event’s type and object only: nothing the API server sends stands for a tag', async () => {
    const { open } = await setup();
    const s = await open();
    await s.change({ add: [{ id: 'mine', path: '/api/v1/namespaces/evil/pods' }] });
    await until(() => s.lines.some((l) => l.type === 'ADDED'));
    expect(s.lines.at(-1)).toEqual({ f: 'mine', type: 'ADDED', object: { metadata: { name: 'e' } } });
  });

  it.each<[string, unknown, string, string?]>([
    ['not a change', [], 'a change is { add?, remove? }'],
    ['a part it has not', { add: [{ id: 'x', path: '/api/v1/pods', namespaces: ['a'] }] }, 'a subscription has no namespaces', 'x'],
    ['an id not one', { add: [{ id: 'a b', path: '/api/v1/pods' }] }, 'an id is letters, digits and . / - _, at most 100', 'a b'],
    ['a path with a query', { add: [{ id: 'x', path: '/api/v1/pods?watch=1' }] }, 'a path is a collection of the API, without a query (/api/v1/pods)', 'x'],
    ['an object', { add: [{ id: 'x', path: '/api/v1/nodes/n1' }] }, 'a path is a collection of the API, without a query (/api/v1/pods)', 'x'],
    ['a resourceVersion not one', { add: [{ id: 'x', path: '/api/v1/pods', resourceVersion: 'a b' }] }, 'a resourceVersion is at most 64, no spaces', 'x'],
    ['another projection', { add: [{ id: 'x', path: '/api/v1/pods', projection: 'table' }] }, 'a projection is metadata, or none', 'x'],
    [
      'an id twice',
      {
        add: [
          { id: 'x', path: '/api/v1/pods' },
          { id: 'x', path: '/api/v1/nodes' },
        ],
      },
      'x is subscribed already',
      'x',
    ],
  ])('refuses %s, all of it', async (_, body, message, f) => {
    const { asked, open } = await setup();
    const s = await open();
    const answer = await s.change(body);
    expect([answer.status, JSON.parse(answer.body)]).toEqual([400, { error: { code: 'bad_stream', message, ...(f === undefined ? {} : { f }) } }]);
    expect(asked).toEqual([]);
  });

  it('holds to its budget: subscriptions in the stream, watches over the process', async () => {
    const { open } = await setup({ watch: { maxChannels: 3 } });
    const s = await open();
    const subs = (n: number, prefix = 'p') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, path: `/api/v1/namespaces/n${i}/pods` }));
    const many = await s.change({ add: subs(201) });
    expect([many.status, JSON.parse(many.body).error.message]).toEqual([400, 'add is at most 200 subscriptions']);
    const over = await s.change({ add: subs(4) });
    expect([over.status, JSON.parse(over.body).error.message]).toEqual([503, '0 watches are open; at most 3']);
    expect((await s.change({ add: subs(3) })).status).toBe(204);
    // What is removed in the same change makes room.
    expect((await s.change({ remove: ['p0', 'p1', 'p2'], add: subs(3, 'q') })).status).toBe(204);
  });

  it('opens nothing for a change its client is let go during (too slow to take REMOVED): no place in the budget kept', async () => {
    const { answers, open } = await setup();
    const s = await open();
    await s.change({ add: [{ id: 'a', path: '/api/v1/namespaces/a/pods' }] });
    await until(() => s.lines.some((l) => l.type === 'ADDED'));
    // From now on, every line waits unread, past any buffer.
    Object.defineProperty(answers[0], 'writableLength', { get: () => Number.POSITIVE_INFINITY });
    const answer = await s.change({ remove: ['a'], add: [{ id: 'b', path: '/api/v1/namespaces/b/pods' }] });
    expect([answer.status, JSON.parse(answer.body).error.code]).toEqual([404, 'no_stream']);
    expect(watchTotals()).toMatchObject({ streams: 0, channels: 0 });
  });

  it('is gone once its client leaves: its watches closed, its name no longer changes anything', async () => {
    const { open } = await setup();
    const s = await open();
    await s.change({ add: [{ id: 'nodes', path: '/api/v1/nodes' }] });
    await until(() => s.lines.some((l) => l.type === 'ADDED'));
    s.leave();
    await until(() => watchTotals().streams === 0 && watchTotals().channels === 0);
    const answer = await s.change({ remove: ['nodes'] });
    expect([answer.status, JSON.parse(answer.body).error.code]).toEqual([404, 'no_stream']);
  });

  it('is told CLOSE when its gateway closes', async () => {
    const { open } = await setup();
    const s = await open();
    gateways[0].close();
    await until(() => s.lines.at(-1)?.type === 'CLOSE');
    expect(s.lines.at(-1)).toEqual({ type: 'CLOSE', reason: 'shutdown' });
  });

  it('is changed by a POST with the header, as JSON, of its own site, read only too; opened with a GET', async () => {
    const { open, post } = await setup({ readOnly: true });
    const s = await open();
    const json = { 'x-overkube': '1', 'content-type': 'application/json' };
    expect((await post(`/stream/${s.name}`, {}, { 'content-type': 'application/json' })).status).toBe(403);
    expect((await post(`/stream/${s.name}`, {}, { ...json, origin: 'https://evil.example' })).status).toBe(403);
    expect((await post(`/stream/${s.name}`, {}, { ...json, 'content-type': 'text/plain' })).status).toBe(415);
    expect((await post('/stream', {})).status).toBe(405);
    expect((await s.change({})).status).toBe(204);
  });
});

describe('a read-only gateway', () => {
  it('passes on asking what one may do (self subject reviews), nothing else that is not a read', async () => {
    const { post } = await setup({ readOnly: true });
    expect((await post('/apis/authorization.k8s.io/v1/selfsubjectrulesreviews', { spec: { namespace: 'a' } })).status).toBe(201);
    expect((await post('/apis/authorization.k8s.io/v1/selfsubjectaccessreviews', {})).status).toBe(201);
    expect((await post('/apis/authorization.k8s.io/v1/subjectaccessreviews', {})).status).toBe(403);
    expect((await post('/api/v1/namespaces/a/pods', {})).status).toBe(403);
  });
});
