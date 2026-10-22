import { Discovery, Http } from '@overkube/connector';
import { type KubeObject, kinds } from '@overkube/kube-types';
import { LIMITS } from '@overkube/query';
import { Field, fieldLayers, kubeKinds } from '@overkube/sdk';
import { memorySource } from '@overkube/source';
import { createRegistry } from '@overweave/core';
import { signal } from '@preact/signals';
import { afterEach, describe, expect, it } from 'vitest';
import { clusterAccess } from './cluster.ts';

/*
 * The cluster as addons see it: what the cluster serves (discovery), what
 * is read (a source: in memory here), writes in an addon's name — none
 * once it has stopped — and the fields addons define, the source's layers.
 */

const { Pod } = kinds.core.v1;
const closing: (() => void)[] = [];
afterEach(() => {
  for (const close of closing.splice(0)) close();
});

/** The aggregated discovery of the core group's pods. */
const DISCOVERY = {
  kind: 'APIGroupDiscoveryList',
  items: [{ metadata: {}, versions: [{ version: 'v1', resources: [{ resource: 'pods', responseKind: { kind: 'Pod' }, scope: 'Namespaced', verbs: ['list', 'watch'] }] }] }],
};

/** A gateway answering discovery and writes; every request sent, with its body; a write held back while hold is set. */
function setup(objects: Record<string, KubeObject[]> = {}) {
  const sent: { request: string; body: unknown; query?: string }[] = [];
  const state = { hold: false };
  const fetch = (async (url: string, init?: RequestInit) => {
    const request = `${init?.method ?? 'GET'} ${new URL(url, 'http://page').pathname.replace(/^\/kube/, '')}`;
    const query = new URL(url, 'http://page').search;
    sent.push({ request, body: init?.body ? JSON.parse(String(init.body)) : undefined, ...(query ? { query } : {}) });
    if (request === 'GET /api') return Response.json(DISCOVERY);
    if (request === 'GET /openapi/v3/api/v1') return Response.json(OPENAPI);
    if (request === 'GET /openapi/v3/apis/apps/v1') return Response.json({ kind: 'Status', code: 404, reason: 'NotFound', message: 'not found' }, { status: 404 });
    if (request === 'GET /apis') return Response.json({ kind: 'APIGroupDiscoveryList', items: [] });
    if (state.hold) return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    return Response.json({ kind: 'Pod', metadata: { name: 'web' } });
  }) as typeof globalThis.fetch;
  const http = new Http({ fetch });
  const discovery = new Discovery(http);
  void discovery.load();
  closing.push(() => discovery.close());
  return { sent, state, access: clusterAccess({ http, discovery }, memorySource(signal(objects))) };
}

/** The core group's OpenAPI (v3), cut short: a Pod's schema, named by its group, version and kind. */
const OPENAPI = {
  components: {
    schemas: {
      'io.k8s.api.core.v1.Pod': {
        type: 'object',
        'x-kubernetes-group-version-kind': [{ group: '', version: 'v1', kind: 'Pod' }],
        properties: { spec: { $ref: '#/components/schemas/io.k8s.api.core.v1.PodSpec' } },
      },
      'io.k8s.api.core.v1.PodSpec': { type: 'object' },
    },
  },
};

const aRun = (id = 'images') => {
  const controller = new AbortController();
  return { id, signal: controller.signal, reaches: [], finds: [], stop: () => controller.abort() };
};

describe('clusterAccess', () => {
  it('says what the cluster serves, once discovery has answered', async () => {
    const { access } = setup();
    expect(access.facts.served('')).toBeUndefined();
    await expect.poll(() => access.facts.served('')).toBe(true);
    expect([access.facts.served('v1/Pod'), access.facts.served('metrics.k8s.io')]).toEqual([true, false]);
  });

  it('says whether an APIService is available, as the source has it', () => {
    const { access } = setup({
      'apiservices.v1.apiregistration.k8s.io': [
        { metadata: { name: 'v1beta1.metrics.k8s.io' }, status: { conditions: [{ type: 'Available', status: 'True' }] } } as KubeObject,
        { metadata: { name: 'v1.down' }, status: { conditions: [{ type: 'Available', status: 'False' }] } } as KubeObject,
      ],
    });
    expect(['v1beta1.metrics.k8s.io', 'v1.down', 'v1.none'].map((n) => access.facts.available(n))).toEqual([true, false, false]);
  });

  it('writes in the addon’s name; what is in flight when it stops is cut off, nothing written after', async () => {
    const { sent, state, access } = setup();
    const run = aRun();
    const cluster = access.open(run);
    await cluster.patch(Pod, { metadata: { name: 'web', namespace: 'shop' } }, { type: 'merge', patch: {} });
    expect(sent.find((s) => s.request === 'POST /patch')?.body).toMatchObject({ path: '/api/v1/namespaces/shop/pods/web', fieldManager: 'overkube-images' });
    // Its status: its own path (its own rights), nothing of the subresource sent beside it.
    await cluster.patch(Pod, { metadata: { name: 'web', namespace: 'shop' } }, { type: 'merge', patch: { status: {} }, subresource: 'status' });
    expect(sent.filter((s) => s.request === 'POST /patch').at(-1)?.body).toEqual({
      path: '/api/v1/namespaces/shop/pods/web/status',
      fieldManager: 'overkube-images',
      type: 'merge',
      patch: { status: {} },
    });
    state.hold = true;
    const late = cluster.patch(Pod, { metadata: { name: 'web', namespace: 'shop' } }, { type: 'merge', patch: {}, fieldManager: 'mine' });
    await expect.poll(() => sent.filter((s) => s.request === 'POST /patch').length).toBe(3);
    expect(sent.at(-1)?.body).toMatchObject({ fieldManager: 'mine' });
    run.stop();
    await expect(late).rejects.toThrow();
    await expect(cluster.patch(Pod, { metadata: { name: 'web' } }, { type: 'merge', patch: {} })).rejects.toThrow(/stopped/);
  });

  it('deletes only the object seen: its uid sent as a precondition; one with no uid is not sent at all', async () => {
    const { sent, access } = setup();
    const cluster = access.open(aRun());
    await expect(cluster.remove(Pod, { metadata: { name: 'web', namespace: 'shop' } })).rejects.toThrow(/no uid/);
    expect(sent.some((s) => s.request.startsWith('DELETE'))).toBe(false);
    await cluster.remove(Pod, { metadata: { name: 'web', namespace: 'shop', uid: 'u1' } });
    expect(sent.find((s) => s.request.startsWith('DELETE'))).toEqual({
      request: 'DELETE /api/v1/namespaces/shop/pods/web',
      body: { apiVersion: 'v1', kind: 'DeleteOptions', preconditions: { uid: 'u1' } },
    });
  });
});

describe('writes as kubectl makes them', () => {
  const pod = { metadata: { name: 'web', namespace: 'shop', uid: 'u1', resourceVersion: '7' } };

  it('replaces checked only (dry run): ?dryRun=All, in the addon’s name', async () => {
    const { access, sent } = setup();
    await access.open(aRun('edit')).update(Pod, pod, { dryRun: true });
    expect(sent.at(-1)).toMatchObject({ request: 'PUT /api/v1/namespaces/shop/pods/web', query: '?fieldManager=overkube-edit&dryRun=All' });
  });

  it('deletes by the cascade said (propagationPolicy), its uid a precondition; checked only: dryRun', async () => {
    const { access, sent } = setup();
    await access.open(aRun('edit')).remove(Pod, pod, { propagationPolicy: 'Orphan', dryRun: true });
    expect(sent.at(-1)).toMatchObject({
      request: 'DELETE /api/v1/namespaces/shop/pods/web',
      query: '?propagationPolicy=Orphan&dryRun=All',
      body: { preconditions: { uid: 'u1' } },
    });
  });

  it('evicts a pod through the Eviction API (policy/v1), checked only by its deleteOptions', async () => {
    const { access, sent } = setup();
    await access.open(aRun('edit')).evict(pod);
    expect(sent.at(-1)).toEqual({
      request: 'POST /api/v1/namespaces/shop/pods/web/eviction',
      body: { apiVersion: 'policy/v1', kind: 'Eviction', metadata: { name: 'web', namespace: 'shop' } },
    });
    await access.open(aRun('edit')).evict(pod, { dryRun: true });
    expect(sent.at(-1)?.body).toMatchObject({ deleteOptions: { dryRun: ['All'] } });
  });

  it('gives a kind’s schema from its group version’s OpenAPI, asked once: a $ref to it, its components beside', async () => {
    const { access, sent } = setup();
    const cluster = access.components();
    const [a, b] = await Promise.all([cluster.schema(Pod), cluster.schema(Pod)]);
    expect(a).toEqual({ $ref: '#/components/schemas/io.k8s.api.core.v1.Pod', components: OPENAPI.components });
    expect(b).toEqual(a);
    expect(sent.filter((x) => x.request === 'GET /openapi/v3/api/v1')).toHaveLength(1);
    expect(await cluster.schema(kinds.core.v1.ConfigMap)).toBeUndefined();
  });

  it('keeps a group version with no OpenAPI (404) as none: not asked again', async () => {
    const { access, sent } = setup();
    const cluster = access.components();
    expect(await cluster.schema(kinds.apps.v1.Deployment)).toBeUndefined();
    expect(await cluster.schema(kinds.apps.v1.Deployment)).toBeUndefined();
    expect(sent.filter((x) => x.request === 'GET /openapi/v3/apis/apps/v1')).toHaveLength(1);
  });
});

describe('fieldLayers', () => {
  it('is the fields addons define, as one layer: anew as they come and go', () => {
    const registry = createRegistry({ kinds: kubeKinds });
    const layers = fieldLayers(registry);
    expect(layers.value).toEqual([{ fields: {} }]);
    const images = registry.contributor('images', { priority: 200, rights: ['configure', 'behaviour'] });
    images.add(Field.name, 'images.tag', { kinds: ['pods.v1'], type: 'string', value: '.spec.containers[0].image' });
    expect(layers.value).toEqual([{ fields: { 'images.tag': { kinds: ['pods.v1'], type: 'string', value: '.spec.containers[0].image' } } }]);
  });

  it('reaches what an addon says it does, from its own cluster alone — nothing once it stops (what is in flight cut off); the page’s reaches none', async () => {
    const { sent, state, access } = setup();
    const trivy = { kind: 'service', namespace: 'trivy', name: 'trivy', port: 4954 } as const;
    const run = { ...aRun('scans'), reaches: [trivy] };
    const cluster = access.open(run);
    expect(await cluster.proxy(trivy).get('/healthz')).toEqual({ kind: 'Pod', metadata: { name: 'web' } });
    expect(sent.at(-1)?.request).toBe('GET /proxy/services/trivy/trivy:4954/healthz');
    expect(() => cluster.proxy({ ...trivy, name: 'prometheus' })).toThrow(/reaches only what it says it does/);
    expect(() => access.components().proxy(trivy)).toThrow(/reached by an addon/);
    state.hold = true;
    const held = cluster.proxy(trivy).get('/scan', undefined, new AbortController().signal);
    run.stop();
    await expect(held).rejects.toThrow(/aborted/);
    await expect(cluster.proxy(trivy).get('/healthz')).rejects.toThrow(/has stopped/);
  });

  it('reaches where a Service its conditions look for is found — that one, that port — and no other', async () => {
    const vm = { metadata: { namespace: 'monitoring', name: 'vmsingle-main' }, spec: { ports: [{ port: 8428 }] } } as KubeObject;
    const { sent, access } = setup({ 'services.v1': [vm] });
    const cluster = access.open({ ...aRun('metrics'), finds: [{ service: ['vmsingle-*'], port: 8428 }] });
    await cluster.proxy({ kind: 'service', namespace: 'monitoring', name: 'vmsingle-main', port: 8428 }).get('/api/v1/query');
    expect(sent.at(-1)?.request).toBe('GET /proxy/services/monitoring/vmsingle-main:8428/api/v1/query');
    for (const other of [
      { kind: 'service', namespace: 'monitoring', name: 'vmsingle-main', port: 22 },
      { kind: 'service', namespace: 'shop', name: 'vmsingle-main', port: 8428 },
      { kind: 'pod', namespace: 'monitoring', name: 'vmsingle-main', port: 8428 },
    ] as const)
      expect(() => cluster.proxy(other)).toThrow(/where the Services its conditions look for are found/);
  });

  it('finds a Service as it comes and goes; more of them than one window: not known, never none', () => {
    const svc = (name: string) => ({ metadata: { namespace: 'm', name }, spec: { ports: [{ port: 8428 }] } }) as KubeObject;
    const objects = signal<Record<string, KubeObject[]>>({ 'services.v1': [] });
    const access = clusterAccess({ http: new Http({ fetch: (async () => Response.json({})) as never }), discovery: new Discovery(new Http()) }, memorySource(objects));
    const spec = { service: 'vmsingle-*' };
    expect(access.facts.found(spec)).toBe(false);
    objects.value = { 'services.v1': [svc('vmsingle-main')] };
    expect(access.facts.found(spec)).toEqual({ kind: 'service', namespace: 'm', name: 'vmsingle-main', port: 8428 });
    objects.value = { 'services.v1': Array.from({ length: LIMITS.page + 1 }, (_, i) => svc(`other-${i}`)) };
    expect(access.facts.found(spec)).toBeUndefined();
    access.close();
  });
});
