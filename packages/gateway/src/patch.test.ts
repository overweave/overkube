import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parsePatch, patch } from './patch.ts';
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

/** A fake API server answering every request with this; returns its kubeconfig and what it was asked. */
async function fakeApiServer(answer: (req: IncomingMessage, body: string, res: ServerResponse) => void) {
  const seen: { method?: string; url?: string; contentType?: string; body: string }[] = [];
  const srv = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, contentType: req.headers['content-type'], body });
      answer(req, body, res);
    });
  });
  const port = await listen(srv);
  const file = join(mkdtempSync(join(tmpdir(), 'ok-')), 'kubeconfig');
  writeFileSync(
    file,
    `clusters:\n- cluster:\n    server: http://127.0.0.1:${port}\n  name: c\nusers:\n- name: u\n  user:\n    token: t\ncontexts:\n- context:\n    cluster: c\n    user: u\n  name: x\ncurrent-context: x\n`,
  );
  return { kubeconfig: file, seen };
}

/** The gateway side: every request's JSON body goes through patch(). */
async function gateway(kubeconfig: string) {
  const srv = createServer((req, res) => {
    let text = '';
    req.on('data', (c) => (text += c));
    req.on('end', () => patch({ body: text ? JSON.parse(text) : undefined }, res, { upstream: fromKubeconfig(kubeconfig) }));
  });
  const url = `http://127.0.0.1:${await listen(srv)}/`;
  return (body: unknown) => fetch(url, { method: 'POST', body: JSON.stringify(body) });
}

const DEPLOYMENT = '/apis/apps/v1/namespaces/media/deployments/jellyfin';

describe('parsePatch', () => {
  it('takes a change to an object or its subresource, with what the page did not say filled in', () => {
    expect(parsePatch({ path: DEPLOYMENT, type: 'merge', patch: { spec: { replicas: 2 } } })).toEqual({
      path: DEPLOYMENT,
      type: 'merge',
      patch: { spec: { replicas: 2 } },
      fieldManager: 'overkube',
      force: false,
      dryRun: false,
    });
    expect(parsePatch({ path: `${DEPLOYMENT}/scale`, type: 'merge', patch: { spec: { replicas: 0 } } })).toMatchObject({ path: `${DEPLOYMENT}/scale` });
    expect(parsePatch({ path: DEPLOYMENT, type: 'apply', patch: { apiVersion: 'apps/v1' }, fieldManager: 'me', force: true, dryRun: true })).toMatchObject({
      fieldManager: 'me',
      force: true,
      dryRun: true,
    });
    expect(parsePatch({ path: DEPLOYMENT, type: 'json', patch: [{ op: 'replace', path: '/spec/replicas', value: 3 }] })).toMatchObject({ type: 'json' });
  });

  it('says what is wrong with one', () => {
    const cases: [unknown, RegExp][] = [
      [null, /not a JSON object/],
      [[], /not a JSON object/],
      [{ type: 'merge', patch: {} }, /^path:/],
      [{ path: `${DEPLOYMENT}?force=true`, type: 'merge', patch: {} }, /without a query/],
      [{ path: '/apis/apps/v1/namespaces/media/deployments', type: 'merge', patch: {} }, /not an object/],
      [{ path: '/version', type: 'merge', patch: {} }, /not an object/],
      [{ path: '/api/v1/namespaces/media/pods/web/exec', type: 'merge', patch: {} }, /not an object/],
      [{ path: DEPLOYMENT, type: 'yaml', patch: {} }, /^type: one of merge, json, strategic, apply/],
      [{ path: DEPLOYMENT, type: 'json', patch: { op: 'add' } }, /list of operations/],
      [{ path: DEPLOYMENT, type: 'json', patch: [{ path: '/a' }] }, /list of operations/],
      [{ path: DEPLOYMENT, type: 'merge', patch: [] }, /a merge patch is a JSON object/],
      [{ path: DEPLOYMENT, type: 'apply', patch: 'kind: Deployment' }, /an apply patch is a JSON object/],
      [{ path: DEPLOYMENT, type: 'merge', patch: {}, fieldManager: 'a b' }, /^fieldManager:/],
      [{ path: DEPLOYMENT, type: 'merge', patch: {}, force: true }, /only for an apply/],
      [{ path: DEPLOYMENT, type: 'apply', patch: {}, force: 'yes' }, /^force:/],
      [{ path: DEPLOYMENT, type: 'merge', patch: {}, dryRun: 1 }, /^dryRun:/],
    ];
    for (const [body, why] of cases) expect(parsePatch(body), JSON.stringify(body)).toMatch(why);
  });
});

describe('parsePatch: the review’s', () => {
  it('takes no type the media types only inherit', () => {
    for (const type of ['__proto__', 'constructor', 'toString']) expect(parsePatch({ path: '/api/v1/namespaces/a', type, patch: {} }), type).toMatch(/^type:/);
  });
});

describe('patch', () => {
  it('sends each kind of patch with its media type and the field manager', async () => {
    const api = await fakeApiServer((_req, _body, res) => res.end('{}'));
    const send = await gateway(api.kubeconfig);
    await send({ path: DEPLOYMENT, type: 'merge', patch: { spec: { replicas: 2 } } });
    await send({ path: DEPLOYMENT, type: 'json', patch: [{ op: 'replace', path: '/spec/replicas', value: 3 }] });
    await send({ path: DEPLOYMENT, type: 'strategic', patch: { spec: { template: { spec: { containers: [{ name: 'web', image: 'nginx:2' }] } } } } });
    await send({ path: DEPLOYMENT, type: 'apply', patch: { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'jellyfin' } } });
    expect(api.seen.map((s) => [s.method, s.contentType])).toEqual([
      ['PATCH', 'application/merge-patch+json'],
      ['PATCH', 'application/json-patch+json'],
      ['PATCH', 'application/strategic-merge-patch+json'],
      ['PATCH', 'application/apply-patch+yaml'],
    ]);
    expect(api.seen.every((s) => s.url === `${DEPLOYMENT}?fieldManager=overkube`)).toBe(true);
    expect(JSON.parse(api.seen[1].body)).toEqual([{ op: 'replace', path: '/spec/replicas', value: 3 }]);
    expect(JSON.parse(api.seen[3].body)).toEqual({ apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'jellyfin' } });
  });

  it('passes force (an apply) and a dry run on as the API server takes them', async () => {
    const api = await fakeApiServer((_req, _body, res) => res.end('{}'));
    const send = await gateway(api.kubeconfig);
    await send({ path: DEPLOYMENT, type: 'apply', patch: {}, fieldManager: 'editor', force: true, dryRun: true });
    expect(api.seen[0].url).toBe(`${DEPLOYMENT}?fieldManager=editor&force=true&dryRun=All`);
  });

  it("brings the API server's answer back as it is, errors included", async () => {
    const api = await fakeApiServer((_req, _body, res) => {
      res.writeHead(409, { 'content-type': 'application/json' });
      res.end('{"kind":"Status","code":409,"reason":"Conflict","message":"Apply failed with 1 conflict"}');
    });
    const res = await (await gateway(api.kubeconfig))({ path: DEPLOYMENT, type: 'apply', patch: {} });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'Conflict' });
  });

  it('answers a bad change with 400 and why, asking the API server nothing', async () => {
    const api = await fakeApiServer((_req, _body, res) => res.end('{}'));
    const res = await (await gateway(api.kubeconfig))({ path: DEPLOYMENT, type: 'yaml', patch: {} });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'bad_patch' } });
    expect(api.seen).toHaveLength(0);
  });

  it('says the cluster is down when there is no kubeconfig', async () => {
    const res = await (await gateway(join(tmpdir(), 'no-such-kubeconfig')))({ path: DEPLOYMENT, type: 'merge', patch: {} });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('kube_down');
  });
});
