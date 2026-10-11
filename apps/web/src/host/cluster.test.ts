import { createClient } from '@overkube/client';
import { FakeGateway } from '@overkube/client/testing';
import { kinds } from '@overkube/kube-types';
import { afterEach, describe, expect, it } from 'vitest';
import { clusterAccess } from './cluster.ts';

/*
 * The cluster as addons see it, over the client and a fake gateway: what
 * the cluster serves, a kind held for a run and let go of when it stops,
 * nothing written once it has.
 */

const { Pod } = kinds.core.v1;
const closing: (() => void)[] = [];
afterEach(() => {
  for (const close of closing.splice(0)) close();
});

const { APIService } = kinds.apiregistration.v1;

function setup(served = [Pod, APIService, kinds.apiextensions.v1.CustomResourceDefinition]) {
  const fake = new FakeGateway(served);
  /** What was sent, with its body. */
  const sent: { request: string; body: unknown }[] = [];
  const fetch: typeof fake.fetch = (url, init) => {
    sent.push({
      request: `${init?.method ?? 'GET'} ${new URL(String(url), 'http://page').pathname.replace(/^\/kube/, '')}`,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return fake.fetch(url, init);
  };
  const client = createClient({ api: { fetch }, stream: { debounceMs: 5 }, store: { lingerMs: 0 } });
  closing.push(() => client.close());
  return { fake, client, sent, access: clusterAccess(client) };
}

/** A run the test stops: what it holds, kept until then (or dropped). */
function aRun(id = 'images') {
  const controller = new AbortController();
  const kept = new Set<() => void>();
  return {
    id,
    signal: controller.signal,
    onDispose(d: () => void) {
      kept.add(d);
      return () => kept.delete(d);
    },
    kept,
    stop() {
      controller.abort();
      for (const d of kept) d();
      kept.clear();
    },
  };
}

describe('clusterAccess', () => {
  it('says what the cluster serves, once discovery has answered', async () => {
    const { access } = setup();
    expect(access.facts.served('')).toBeUndefined();
    await expect.poll(() => access.facts.served('')).toBe(true);
    expect([access.facts.served('v1/Pod'), access.facts.served('metrics.k8s.io')]).toEqual([true, false]);
  });

  it('holds a kind for a run, and lets it go when the run stops; writes nothing after', async () => {
    const { fake, client, access } = setup();
    fake.add(Pod, { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'web', namespace: 'shop', uid: 'u1' } });
    const run = new AbortController();
    const disposers: (() => void)[] = [];
    const cluster = access.open({
      id: 'images',
      onDispose: (d) => {
        disposers.push(d);
        return () => {};
      },
      signal: run.signal,
    });
    const pods = cluster.collection(Pod);
    await expect.poll(() => pods.items.value.size).toBe(1);
    expect(client.store.kinds).toContain('v1/Pod');
    run.abort();
    for (const d of disposers) d();
    await expect.poll(() => client.store.kinds.includes('v1/Pod')).toBe(false);
    await expect(cluster.remove(Pod, pods.items.value.get('shop/web') as never)).rejects.toThrow(/stopped/);
  });

  it('keeps the APIServices for the page’s life once a condition asks: still known long after (not a peek let go of)', async () => {
    const { fake, client, access } = setup();
    fake.add(APIService, {
      apiVersion: 'apiregistration.k8s.io/v1',
      kind: 'APIService',
      metadata: { name: 'v1beta1.metrics.k8s.io', uid: 'a1' },
      status: { conditions: [{ type: 'Available', status: 'True' }] },
    } as never);
    expect(access.facts.available('v1beta1.metrics.k8s.io')).toBeUndefined();
    await expect.poll(() => access.facts.available('v1beta1.metrics.k8s.io')).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect([access.facts.available('v1beta1.metrics.k8s.io'), access.facts.available('v1.other')]).toEqual([true, false]);
    expect(client.store.kinds).toContain(APIService.id);
  });

  it('says an APIService is not available where the cluster serves none (not: not known yet)', async () => {
    const { access } = setup([Pod]);
    access.facts.available('v1beta1.metrics.k8s.io');
    await expect.poll(() => access.facts.available('v1beta1.metrics.k8s.io')).toBe(false);
  });

  it('writes in the addon’s name; what is in flight when it stops is cut off', async () => {
    const { fake, sent, access } = setup();
    const run = aRun();
    const cluster = access.open(run);
    fake.answer('POST /patch', { status: 200, body: { kind: 'Pod', metadata: { name: 'web' } } });
    await cluster.patch(Pod, { metadata: { name: 'web', namespace: 'shop' } }, { type: 'merge', patch: {} });
    expect(sent.find((s) => s.request === 'POST /patch')?.body).toMatchObject({ path: '/api/v1/namespaces/shop/pods/web', fieldManager: 'overkube-images' });
    const held = fake.hold('POST /patch');
    const late = cluster.patch(Pod, { metadata: { name: 'web', namespace: 'shop' } }, { type: 'merge', patch: {}, fieldManager: 'mine' });
    await expect.poll(() => sent.filter((s) => s.request === 'POST /patch').length).toBe(2);
    expect(sent.at(-1)?.body).toMatchObject({ fieldManager: 'mine' });
    run.stop();
    await expect(late).rejects.toThrow();
    held.release();
  });

  it('deletes only the object seen: its uid sent as a precondition; one with no uid is not sent at all', async () => {
    const { fake, sent, access } = setup();
    fake.add(Pod, { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'web', namespace: 'shop', uid: 'u1' } });
    const cluster = access.open(aRun());
    fake.answer('DELETE /api/v1/namespaces/shop/pods/web', { status: 200, body: { kind: 'Status', status: 'Success' } });
    await expect(cluster.remove(Pod, { metadata: { name: 'web', namespace: 'shop' } })).rejects.toThrow(/no uid/);
    expect(sent.some((s) => s.request.startsWith('DELETE'))).toBe(false);
    await cluster.remove(Pod, { metadata: { name: 'web', namespace: 'shop', uid: 'u1' } });
    expect(sent.find((s) => s.request.startsWith('DELETE'))).toEqual({
      request: 'DELETE /api/v1/namespaces/shop/pods/web',
      body: { apiVersion: 'v1', kind: 'DeleteOptions', preconditions: { uid: 'u1' } },
    });
  });

  it('lets go of a kind held and released: no longer the run’s to let go of', async () => {
    const { client, access } = setup();
    const run = aRun();
    const cluster = access.open(run);
    const release = cluster.hold(Pod);
    expect(run.kept.size).toBe(1);
    release();
    release();
    expect(run.kept.size).toBe(0);
    await expect.poll(() => client.store.kinds.includes('v1/Pod')).toBe(false);
  });

  it('gives components no collection(): what they hold, they hold while drawn', () => {
    const { access } = setup();
    expect('collection' in access.components()).toBe(false);
  });
});
