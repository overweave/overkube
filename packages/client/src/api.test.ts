import { describe, expect, it } from 'vitest';
import { Api, ApiError, collectionPath, objectPath } from './api.ts';
import { FakeGateway, kindOf } from './testing.ts';

const Pod = kindOf('', 'v1', 'Pod', 'pods');
const Deployment = kindOf('apps', 'v1', 'Deployment', 'deployments');

describe('paths', () => {
  it('are where the API has a kind, across the cluster or in a namespace', () => {
    expect(collectionPath(Pod)).toBe('/api/v1/pods');
    expect(collectionPath(Deployment, 'media')).toBe('/apis/apps/v1/namespaces/media/deployments');
    expect(objectPath(Deployment, 'jellyfin', 'media')).toBe('/apis/apps/v1/namespaces/media/deployments/jellyfin');
    // As it is: the gateway refuses %-encoding, and the API's names need none.
    expect(objectPath(kindOf('rbac.authorization.k8s.io', 'v1', 'ClusterRole', 'clusterroles', false), 'system:node')).toBe(
      '/apis/rbac.authorization.k8s.io/v1/clusterroles/system:node',
    );
  });
});

describe('Api', () => {
  it('deletes only the object seen: its uid as a precondition', async () => {
    const sent: { method?: string; url: string; body?: unknown }[] = [];
    const api = new Api({
      fetch: async (url, init) => {
        sent.push({ method: init?.method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
        return new Response('{"kind":"Status","status":"Success"}', { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    await api.remove(objectPath(Pod, 'web', 'media'), { uid: 'u1', propagationPolicy: 'Background' });
    expect(sent[0]).toMatchObject({
      method: 'DELETE',
      body: { apiVersion: 'v1', kind: 'DeleteOptions', preconditions: { uid: 'u1' } },
    });
    expect(sent[0].url).toContain('/api/v1/namespaces/media/pods/web?propagationPolicy=Background');
  });

  it('lists every page, and gives the list’s resourceVersion', async () => {
    const fake = new FakeGateway([Pod]);
    for (const name of ['a', 'b', 'c']) fake.add(Pod, { metadata: { name, namespace: 'x' } });
    fake.pageSize = 2;
    const list = await new Api({ fetch: fake.fetch }).list(collectionPath(Pod));
    expect(list.items.map((p) => p.metadata?.name)).toEqual(['a', 'b', 'c']);
    expect(list.resourceVersion).toBe('103');
    expect(fake.requests).toEqual(['GET /api/v1/pods?limit=500', 'GET /api/v1/pods?limit=500&continue=s1-2']);
  });

  it('says what went wrong: the gateway’s error, a Kubernetes Status, nothing answering', async () => {
    const fake = new FakeGateway();
    const api = new Api({ fetch: fake.fetch });
    fake.answer('GET /api/v1/pods', { status: 503, body: { error: { code: 'kube_down', message: 'the Kubernetes API server is not answering' } } });
    fake.answer('GET /api/v1/secrets', { status: 403, body: { kind: 'Status', code: 403, reason: 'Forbidden', message: 'secrets is forbidden' } });
    fake.answer('GET /api/v1/nodes', 'network');
    fake.answer('GET /version', { status: 502, body: 'Bad Gateway' });

    const down = await api.get('/api/v1/pods').catch((e: ApiError) => e);
    expect(down).toMatchObject({ status: 503, code: 'kube_down', passing: true });
    const forbidden = await api.get('/api/v1/secrets').catch((e: ApiError) => e);
    expect(forbidden).toMatchObject({ status: 403, code: 'Forbidden', message: 'secrets is forbidden', passing: false });
    expect((forbidden as ApiError).kubeStatus?.reason).toBe('Forbidden');
    expect(await api.get('/api/v1/nodes').catch((e: ApiError) => e)).toMatchObject({ status: 0, code: 'network', passing: true });
    expect(await api.get('/version').catch((e: ApiError) => e)).toBeInstanceOf(ApiError);
  });

  it('begins a list again when its snapshot expires on the way (410 on a later page), never mixing two', async () => {
    const fake = new FakeGateway([Pod]);
    for (const name of ['a', 'b', 'c']) fake.add(Pod, { metadata: { name, namespace: 'x' } });
    fake.pageSize = 2;
    const api = new Api({ fetch: fake.fetch });
    const first = fake.hold('GET /api/v1/pods');
    const second = fake.hold('GET /api/v1/pods');
    const listing = api.list(collectionPath(Pod));
    first.release();
    // The first page is taken; before the second, the snapshot expires and an object goes.
    await expect.poll(() => fake.requests.length).toBe(2);
    fake.expireLists();
    fake.remove(Pod, 'a', 'x');
    second.release();
    const list = await listing;
    expect(list.items.map((p) => p.metadata?.name)).toEqual(['b', 'c']);
    expect(fake.requests).toEqual(['GET /api/v1/pods?limit=500', 'GET /api/v1/pods?limit=500&continue=s1-2', 'GET /api/v1/pods?limit=500']);
  });

  it('gives up a list whose snapshot keeps expiring, after a few tries', async () => {
    const fake = new FakeGateway([Pod]);
    fake.answer('GET /api/v1/pods', ...Array.from({ length: 3 }, () => ({ status: 410, body: { kind: 'Status', code: 410, reason: 'Expired' } })));
    const error = await new Api({ fetch: fake.fetch }).list(collectionPath(Pod)).catch((e: ApiError) => e);
    expect(error).toMatchObject({ status: 410, code: 'Expired', passing: false });
    expect(fake.requests).toHaveLength(3);
  });

  it('says what is wrong with an answer that is not JSON (not passing), or broke off (passing)', async () => {
    const fake = new FakeGateway();
    const api = new Api({ fetch: fake.fetch });
    fake.answer('GET /status', { status: 200, body: '<html>log in</html>', raw: true });
    expect(await api.status().catch((e: ApiError) => e)).toMatchObject({ status: 200, code: 'bad_json', passing: false });
    const broken = new Api({
      fetch: async () =>
        new Response(
          new ReadableStream({
            start: (c) => {
              c.enqueue(new TextEncoder().encode('{"gateway":'));
              c.error(new TypeError('network error'));
            },
          }),
        ),
    });
    expect(await broken.status().catch((e: ApiError) => e)).toMatchObject({ status: 0, code: 'network', passing: true });
  });

  it('ends the session when the host turns the page away (401, a 403 without a Status), asking nothing more', async () => {
    for (const answer of [
      { status: 401, body: { message: 'Unauthorized', statusCode: 401 } },
      { status: 403, body: { message: 'Forbidden resource', error: 'Forbidden', statusCode: 403 } },
    ]) {
      const fake = new FakeGateway();
      const api = new Api({ fetch: fake.fetch });
      fake.answer('GET /status', answer);
      expect(await api.status().catch((e: ApiError) => e)).toMatchObject({ code: 'unauthorized', passing: false });
      expect(api.session.value).toBe('expired');
      expect(await api.get('/version').catch((e: ApiError) => e)).toMatchObject({ code: 'unauthorized' });
      expect(fake.requests).toHaveLength(1);
    }
  });

  it('keeps a Kubernetes 403 (with its Status) a refusal of that request only', async () => {
    const fake = new FakeGateway();
    const api = new Api({ fetch: fake.fetch });
    fake.answer('GET /api/v1/secrets', { status: 403, body: { kind: 'Status', code: 403, reason: 'Forbidden' } });
    await api.get('/api/v1/secrets').catch(() => {});
    expect(api.session.value).toBe('ok');
  });

  it('sends changes as JSON through /patch, with the headers it is given', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const api = new Api({
      fetch: async (url, init) => {
        seen.push({ url: String(url), init });
        return new Response('{}', { status: 200 });
      },
      headers: () => ({ 'x-csrf-token': 'token' }),
    });
    await api.patch({ path: '/apis/apps/v1/namespaces/media/deployments/web', type: 'merge', patch: { spec: { replicas: 0 } } });
    expect(seen[0].url).toBe('/kube/patch');
    expect(seen[0].init?.method).toBe('POST');
    expect(seen[0].init?.headers).toMatchObject({ 'content-type': 'application/json', 'x-csrf-token': 'token' });
    expect(JSON.parse(String(seen[0].init?.body))).toEqual({ path: '/apis/apps/v1/namespaces/media/deployments/web', type: 'merge', patch: { spec: { replicas: 0 } } });
  });

  it('takes an answer that broke off as the network’s, never as the session’s end', async () => {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"kind":"Sta'));
        c.error(new TypeError('network error'));
      },
    });
    const api = new Api({ fetch: async () => new Response(body, { status: 403 }) });
    expect(await api.get('/api/v1/pods').catch((e: ApiError) => e)).toMatchObject({ code: 'network', passing: true });
    expect(api.session.value).toBe('ok');
  });
});
