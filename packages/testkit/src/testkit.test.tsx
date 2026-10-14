import { kinds } from '@overkube/kube-types';
import { column, defineAddon, section, slots } from '@overkube/sdk';
import { useCount } from '@overkube/sdk/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { assertContributions, assertSays, cleanup, everyOrder, fakeCluster, kubeWorld, make } from './index.ts';
import { renderSlot } from './preact/index.ts';

/*
 * The testkit as an addon's test meets it: a cluster in memory told what
 * happens (read through queries, as the page's) and keeping what is
 * written, objects made, addons run as on the page and stopped, their
 * slots drawn over the cluster.
 */

afterEach(cleanup);

const { Pod } = kinds.core.v1;
const { Deployment } = kinds.apps.v1;

describe('make', () => {
  it('makes an object as the API server would have it, what is given over it', () => {
    const pod = make(Pod, { metadata: { name: 'web' }, spec: { nodeName: 'n1', containers: [] } });
    expect(pod).toMatchObject({ apiVersion: 'v1', kind: 'Pod', metadata: { name: 'web', namespace: 'default' }, spec: { nodeName: 'n1' } });
    expect(pod.metadata?.uid).toMatch(/^0{8}-/);
    expect(make(kinds.core.v1.Namespace).metadata?.namespace).toBeUndefined();
  });
});

describe('fakeCluster', () => {
  it('keeps the objects it is told of, read through queries as the page’s; a kind’s state as said', () => {
    const cluster = fakeCluster();
    const pods = cluster.source.list({ kind: 'pods.v1', page: { limit: 10 }, select: ['.spec.nodeName'] });
    cluster.add(Pod, make(Pod, { metadata: { name: 'web', namespace: 'shop' } }));
    cluster.change(Pod, make(Pod, { metadata: { name: 'web', namespace: 'shop' }, spec: { nodeName: 'n2', containers: [] } }));
    expect(pods.value.items.map((i) => [i.key, i.values?.['.spec.nodeName']])).toEqual([['shop/web', ['n2']]]);
    cluster.take(Pod, 'web', 'shop');
    expect(pods.value.items).toEqual([]);
    cluster.state(Pod, 'error', { status: 403, code: 'Forbidden' });
    expect([pods.value.state, pods.value.error?.code]).toEqual(['error', 'Forbidden']);
    cluster.state(Pod, 'live');
    expect(pods.value.state).toBe('live');
  });

  it('keeps what is written: a merge patch applied, a delete; a refusal once', async () => {
    const cluster = fakeCluster();
    const d = cluster.add(Deployment, make(Deployment, { metadata: { name: 'shop', namespace: 'web' }, spec: { replicas: 1, selector: {}, template: {} } }));
    const patched = await cluster.patch(Deployment, d, { type: 'merge', patch: { spec: { replicas: 3 } } });
    expect((patched as typeof d).spec?.replicas).toBe(3);
    cluster.refuse('remove', { status: 409, code: 'Conflict' });
    await expect(cluster.remove(Deployment, d)).rejects.toMatchObject({ status: 409 });
    await cluster.remove(Deployment, d);
    expect(cluster.get(Deployment, 'shop', 'web')).toBeUndefined();
    expect(cluster.writes.map((w) => `${w.op} ${w.kind} ${w.namespace}/${w.name}`)).toEqual([
      'patch apps/v1/Deployment web/shop',
      'remove apps/v1/Deployment web/shop',
      'remove apps/v1/Deployment web/shop',
    ]);
  });

  it('serves every group and kind unless told which', () => {
    expect(fakeCluster().served('traefik.io')).toBe(true);
    const some = fakeCluster({ served: ['', 'apps'] });
    expect([some.served('apps'), some.served('traefik.io')]).toEqual([true, false]);
    some.serve('traefik.io');
    expect(some.served('traefik.io')).toBe(true);
  });
});

describe('kubeWorld', () => {
  const images = defineAddon({
    id: 'images',
    title: 'Images',
    setup(ctx) {
      ctx.contributor.add(
        'Column',
        'images.tag',
        column({ kinds: [Pod], header: 'Tag', sort: '.spec.containers[0].image', format: ([image]) => String(image ?? '').split(':')[1] ?? '' }),
      );
      ctx.contributor.patch('Column', 'core.name', { header: 'Pod' });
    },
  });
  const core = defineAddon({
    id: 'core',
    title: 'Core',
    layer: 'core',
    setup: ({ contributor }) => void contributor.add('Column', 'core.name', column({ header: 'Name', sort: 'core.name' })),
  });

  it('runs addons as the page does: at their layers, what they said taken back when they stop', () => {
    const w = kubeWorld();
    w.addon(core);
    w.addon(images);
    assertContributions(w, 'images', [
      { kind: 'Column', name: 'images.tag', operation: 'add', status: 'included' },
      { kind: 'Column', name: 'core.name', operation: 'patch', status: 'included' },
    ]);
    assertSays(w, 'Column', 'core.name', ['header'], 'images');
    expect(w.get('Column', 'images.tag')?.spec.format?.(['nginx:latest'], { now: 0, kind: Pod, say: (() => '') as never })).toBe('latest');
    w.stop('images');
    expect([w.get('Column', 'images.tag'), w.get('Column', 'core.name')?.spec.header]).toEqual([undefined, 'Name']);
  });

  it('reads the same whatever order its addons start in', () => {
    everyOrder(
      () => kubeWorld(),
      [
        { id: 'core', setup: (c) => core.setup({ contributor: c } as never), grant: { priority: 0, rights: ['configure', 'behaviour'] } },
        { id: 'images', setup: (c) => images.setup({ contributor: c, cluster: fakeCluster() } as never), grant: { priority: 200, rights: ['configure', 'behaviour'] } },
      ],
    );
  });

  it('gives services between addons; keeps what a callback throws as the addon’s; writes nothing once stopped', async () => {
    const w = kubeWorld();
    w.addon(defineAddon({ id: 'frame', title: 'Frame', provides: { frame: () => ({ ready: true }) }, setup() {} }));
    let late: () => void = () => {};
    let ctx: Parameters<Parameters<typeof defineAddon>[0]['setup']>[0] | undefined;
    w.addon(
      defineAddon({
        id: 'reader',
        title: 'Reader',
        setup(c) {
          ctx = c;
          late = c.guard(() => {
            throw new Error('late');
          });
        },
      }),
    );
    expect(ctx?.services.get('frame')).toEqual({ ready: true });
    late();
    expect(w.failures('reader').map((e) => (e as Error).message)).toEqual(['late']);
    w.stop('reader');
    await expect(ctx?.cluster.remove(Pod, make(Pod))).rejects.toThrow(/stopped/);
    w.stop('frame');
    expect(w.service('frame')).toBeNull();
  });

  it('runs an addon as the page does: an async setup waited for, a failing cleanup not stopping the rest, nothing after it stops', async () => {
    const w = kubeWorld();
    let finish: () => void = () => {};
    let effects = 0;
    let ctx: Parameters<Parameters<typeof defineAddon>[0]['setup']>[0] | undefined;
    w.addon(
      defineAddon({
        id: 'slow',
        title: 'Slow',
        async setup(c) {
          ctx = c;
          await new Promise<void>((done) => {
            finish = done;
          });
          return () => {
            throw new Error('cleanup failed');
          };
        },
      }),
    );
    finish();
    await w.ready('slow');
    w.stop('slow');
    expect(w.failures('slow').map((e) => (e as Error).message)).toEqual(['slow: stopping: cleanup failed']);
    ctx?.effect(() => {
      effects++;
    });
    expect(effects).toBe(0);
  });

  it('stops an addon whose async setup fails, keeping why', async () => {
    const w = kubeWorld();
    w.addon(
      defineAddon({
        id: 'broken',
        title: 'Broken',
        async setup({ contributor }) {
          contributor.add('Column', 'broken.c', column({ header: 'C', sort: 'core.name' }));
          throw new Error('no luck');
        },
      }),
    );
    await expect(w.ready('broken')).rejects.toThrow('no luck');
    expect([w.get('Column', 'broken.c'), w.failures('broken').length]).toEqual([undefined, 1]);
  });

  it('keeps a service its provider’s: another giving it is refused; an effect follows it', () => {
    const w = kubeWorld();
    const seen: unknown[] = [];
    w.addon(defineAddon({ id: 'reader', title: 'Reader', setup: (c) => c.effect(() => void seen.push(c.services.get('frame'))) }));
    w.addon(defineAddon({ id: 'frame', title: 'Frame', provides: { frame: () => 'first' }, setup() {} }));
    w.addon(defineAddon({ id: 'other', title: 'Other', provides: { frame: () => 'second' }, setup() {} }));
    expect([w.service('frame'), (w.failures('other')[0] as Error).message]).toEqual(['first', 'frame is provided by frame already']);
    w.stop('frame');
    expect(seen).toEqual([null, 'first', null]);
  });

  it('keeps an async callback’s rejection as the addon’s', async () => {
    const w = kubeWorld();
    let later: () => Promise<unknown> = async () => {};
    w.addon(
      defineAddon({
        id: 'cb',
        title: 'Callback',
        setup(c) {
          later = c.guard(async () => {
            throw new Error('rejected');
          });
        },
      }),
    );
    await expect(later()).resolves.toBeUndefined();
    expect(w.failures('cb').map((e) => (e as Error).message)).toEqual(['rejected']);
  });

  it('writes in the addon’s name; deletes only the object seen (its uid), as the cluster would', async () => {
    const w = kubeWorld();
    let ctx: Parameters<Parameters<typeof defineAddon>[0]['setup']>[0] | undefined;
    w.addon(
      defineAddon({
        id: 'ops',
        title: 'Ops',
        setup(c) {
          ctx = c;
        },
      }),
    );
    const seen = w.cluster.add(Pod, make(Pod, { metadata: { name: 'web' } }));
    await ctx?.cluster.patch(Pod, seen, { type: 'merge', patch: { metadata: { labels: { a: 'b' } } } });
    expect(w.cluster.writes[0].change).toMatchObject({ fieldManager: 'overkube-ops' });
    await expect(ctx?.cluster.remove(Pod, { metadata: { name: 'web', namespace: 'default' } })).rejects.toThrow(/no uid/);
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'web' } }));
    await expect(ctx?.cluster.remove(Pod, seen)).rejects.toMatchObject({ status: 409 });
    expect(w.cluster.get(Pod, 'web', 'default')).toBeDefined();
  });
});

describe('drawing', () => {
  it('draws a slot over the world’s cluster, its fills chosen by kind', () => {
    const w = kubeWorld();
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'a' } }));
    w.cluster.add(Pod, make(Pod, { metadata: { name: 'b' } }));
    const Count = () => <b>{useCount({ kind: 'pods.v1' }).total?.count} pods</b>;
    w.addon(defineAddon({ id: 'pods', title: 'Pods', setup: ({ contributor }) => void contributor.add('Fill', 'pods.count', section({ kinds: [Pod], render: Count })) }));
    const pod = w.cluster.get(Pod, 'a', 'default');
    expect(renderSlot(w, slots.resource.view.sections, { kind: Pod, object: pod as never }).text()).toBe('2 pods');
    expect(renderSlot(w, slots.resource.view.sections, { kind: Deployment, object: make(Deployment) }).text()).toBe('');
  });
});
