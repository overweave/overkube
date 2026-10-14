import { type Addon, column, defineAddon, kubeKinds } from '@overkube/sdk';
import { createRegistry } from '@overweave/core';
import { signal } from '@preact/signals';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddonHost } from './addons.ts';
import type { ClusterAccess } from './cluster.ts';

/*
 * The addons' host: each addon a contributor at its layer, what it said
 * taken back when it stops, started as what it requires comes and goes,
 * started again after its setup fails (then left alone), the safe mode,
 * services, a failure told as its owner's.
 */

const hosts: AddonHost[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.close();
  vi.useRealTimers();
});

/** A cluster whose facts the test sets: served groups, available APIServices. */
function setup(options: { safe?: boolean; log?: (message: string) => void } = {}) {
  const served = signal<Set<string> | null>(new Set(['']));
  const available = signal<Set<string>>(new Set());
  const cluster: ClusterAccess = {
    facts: { served: (g) => (served.value ? served.value.has(g) : undefined), available: (a) => available.value.has(a) },
    open: () => ({}) as never,
    components: () => ({}) as never,
  };
  const registry = createRegistry({ kinds: kubeKinds });
  const host = new AddonHost({ registry, cluster, safe: options.safe, retryMs: 10, maxRetryMs: 40, maxCrashes: 3, log: options.log ?? (() => {}) });
  hosts.push(host);
  return { registry, host, served, available };
}

const named = (id: string, layer: Addon['layer'], setup: Addon['setup'], more: Partial<Addon> = {}) => defineAddon({ id, title: id, layer, setup, ...more });
const col = (header: string) => column({ header, sort: 'core.name' });

describe('the host', () => {
  it('runs each addon as a contributor at its layer; what it said goes when it stops', () => {
    const { registry, host } = setup();
    host.register(named('core', 'core', ({ contributor }) => void contributor.add('Column', 'core.name', col('Name'))));
    host.register(named('images', 'addon', ({ contributor }) => void contributor.patch('Column', 'core.name', { header: 'Image' })));
    expect(host.statuses.value.map((s) => [s.id, s.state])).toEqual([
      ['core', 'running'],
      ['images', 'running'],
    ]);
    expect(registry.get('Column', 'core.name')?.spec.header).toBe('Image');
    expect(registry.inspect('Column', 'core.name').contributions.map((c) => [c.contributor, c.priority])).toEqual([
      ['core', 0],
      ['images', 200],
    ]);
    host.close();
    expect(registry.get('Column', 'core.name')).toBeUndefined();
  });

  it('starts an addon once what it requires holds, and stops it when it no longer does', () => {
    const { registry, host, served } = setup();
    served.value = null;
    host.register(named('metrics', 'addon', ({ contributor }) => void contributor.add('Column', 'metrics.cpu', col('CPU')), { requires: { served: 'metrics.k8s.io' } }));
    expect(host.status('metrics')).toMatchObject({ state: 'unavailable', reason: 'not known yet' });
    served.value = new Set(['']);
    expect(host.status('metrics')).toMatchObject({ state: 'unavailable', reason: 'metrics.k8s.io is not served' });
    served.value = new Set(['', 'metrics.k8s.io']);
    expect(host.status('metrics')?.state).toBe('running');
    expect(registry.get('Column', 'metrics.cpu')).toBeDefined();
    served.value = new Set(['']);
    expect(host.status('metrics')?.state).toBe('unavailable');
    expect(registry.get('Column', 'metrics.cpu')).toBeUndefined();
  });

  it('starts a setup that throws again after a wait, then leaves it failed — what it said before throwing taken back', async () => {
    vi.useFakeTimers();
    const { registry, host } = setup();
    const setupFn = vi.fn(({ contributor }) => {
      contributor.add('Column', 'flaky.c', col('C'));
      throw new Error('no luck');
    });
    host.register(named('flaky', 'addon', setupFn as Addon['setup']));
    expect(host.status('flaky')).toMatchObject({ state: 'crashloop', error: 'no luck', restarts: 1 });
    expect(registry.get('Column', 'flaky.c')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(100);
    expect(host.status('flaky')).toMatchObject({ state: 'failed', reason: 'its setup failed 3 times in a row' });
    expect(setupFn).toHaveBeenCalledTimes(3);
    host.restart('flaky');
    expect(setupFn).toHaveBeenCalledTimes(4);
  });

  it('in safe mode runs only the core’s and the built-in addons', () => {
    const { host } = setup({ safe: true });
    host.register(named('core', 'core', () => {}));
    host.register(named('images', 'addon', () => {}));
    expect(host.statuses.value.map((s) => [s.id, s.state, s.reason])).toEqual([
      ['core', 'running', undefined],
      ['images', 'disabled', 'safe mode'],
    ]);
  });

  it('gives services while their provider runs; one requiring a service waits for it', () => {
    const { host } = setup();
    let seen: unknown = 'nothing';
    host.register(
      named(
        'reader',
        'addon',
        (ctx) => {
          seen = ctx.services.get('frame');
        },
        { requires: { service: 'frame' } },
      ),
    );
    expect(host.status('reader')?.state).toBe('unavailable');
    host.register(named('core', 'core', () => {}, { provides: { frame: () => ({ ready: true }) } }));
    expect([host.status('reader')?.state, seen]).toEqual(['running', { ready: true }]);
  });

  it('suggests an addon that is off when what it detects is there', () => {
    const { host, served } = setup();
    host.register(named('traefik', 'addon', () => {}, { detect: { served: 'traefik.io' } }));
    expect(host.status('traefik')?.state).toBe('running');
    const off = new AddonHost({
      registry: createRegistry({ kinds: kubeKinds }),
      cluster: { facts: { served: (g) => g === 'traefik.io', available: () => false }, open: () => ({}) as never, components: () => ({}) as never },
      enabled: () => false,
    });
    hosts.push(off);
    off.register(named('traefik', 'addon', () => {}, { detect: { served: 'traefik.io' } }));
    expect(off.status('traefik')).toMatchObject({ state: 'disabled', suggested: true });
    expect(served.value).toBeDefined();
  });

  it('tells a failure as its owner’s: the addon that says what failed is degraded', () => {
    const { host } = setup();
    host.register(named('core', 'core', ({ contributor }) => void contributor.add('Column', 'core.name', col('Name'))));
    host.register(named('broken', 'addon', ({ contributor }) => void contributor.add('Fill', 'broken.f', { slot: 's', render: () => null })));
    host.failed({ kind: 'Fill', name: 'broken.f' }, 'render', new Error('drawn wrong'));
    expect(host.status('broken')).toMatchObject({ state: 'degraded', errors: 1, error: 'drawn wrong' });
    expect(host.status('core')?.state).toBe('running');
    expect(host.ownerOf('Column', 'core.name', 'sort')).toBe('core');
  });

  it('keeps what a callback of an addon throws its own; after it stops, only says so — the new run untouched', () => {
    const said: string[] = [];
    const { host: logged } = setup({ log: (m) => said.push(m) });
    const runs: (() => unknown)[] = [];
    logged.register(
      named('cb', 'addon', (ctx) => {
        const run = runs.length + 1;
        runs.push(
          ctx.guard(() => {
            throw new Error(`late ${run}`);
          }),
        );
      }),
    );
    runs[0]();
    expect(logged.status('cb')).toMatchObject({ state: 'degraded', errors: 1, error: 'late 1' });
    // Started anew: the old run's callback, called after, only said — the new run's status its own.
    logged.restart('cb');
    expect(logged.status('cb')).toMatchObject({ state: 'running', errors: 0 });
    expect(runs[0]()).toBeUndefined();
    expect(logged.status('cb')).toMatchObject({ state: 'running', errors: 0 });
    expect(said).toEqual(['cb: after it stopped: late 1']);
  });

  it('tells what the registry refuses an addon as its failure (a name another defines)', () => {
    const { host } = setup();
    host.register(named('core', 'core', ({ contributor }) => void contributor.add('Column', 'shared', col('Core’s'))));
    host.register(named('late', 'addon', ({ contributor }) => void contributor.add('Column', 'shared', col('Mine'))));
    expect(host.status('late')).toMatchObject({ state: 'degraded', errors: 1, error: 'Column/shared refused: taken' });
  });

  it('takes back an addon’s notifications when it stops — but for errors', () => {
    const told = new Map<string, string>();
    let next = 0;
    const registry = createRegistry({ kinds: kubeKinds });
    const host = new AddonHost({
      registry,
      cluster: { facts: { served: () => true, available: () => true }, open: () => ({}) as never, components: () => ({}) as never },
      notify: (n) => {
        const id = `n${++next}`;
        told.set(id, n.text);
        return id;
      },
      dismiss: (id) => void told.delete(id),
      log: () => {},
    });
    hosts.push(host);
    host.register(
      named('tell', 'addon', (ctx) => {
        ctx.notify({ text: 'saved' });
        ctx.notify({ level: 'error', text: 'refused' });
      }),
    );
    expect([...told.values()]).toEqual(['saved', 'refused']);
    host.close();
    expect([...told.values()]).toEqual(['refused']);
  });

  it('keeps an async callback’s rejection its own too', async () => {
    const { host } = setup();
    let later: () => Promise<number | undefined> = async () => 0;
    host.register(
      named('cb', 'addon', (ctx) => {
        later = ctx.guard(async () => {
          throw new Error('rejected');
        });
      }),
    );
    await expect(later()).resolves.toBeUndefined();
    expect(host.status('cb')).toMatchObject({ state: 'degraded', errors: 1, error: 'rejected' });
  });

  it('waits for an async setup: starting until it has finished, what it gives back kept', async () => {
    const { host, registry } = setup();
    let finish: () => void = () => {};
    const stopped = vi.fn();
    host.register(
      named('slow', 'addon', async ({ contributor }) => {
        await new Promise<void>((done) => {
          finish = done;
        });
        contributor.add('Column', 'slow.c', col('Slow'));
        return stopped;
      }),
    );
    expect(host.status('slow')?.state).toBe('starting');
    finish();
    await expect.poll(() => host.status('slow')?.state).toBe('running');
    expect(registry.get('Column', 'slow.c')).toBeDefined();
    host.close();
    expect(stopped).toHaveBeenCalledOnce();
  });

  it('follows a service in an effect: one that comes, goes or is made anew', () => {
    const { host } = setup();
    const seen: unknown[] = [];
    host.register(named('reader', 'addon', (ctx) => ctx.effect(() => void seen.push(ctx.services.get('frame')))));
    host.register(named('frame', 'builtin', () => {}, { provides: { frame: () => ({ n: seen.length }) } }));
    host.restart('frame');
    expect(seen).toEqual([null, { n: 1 }, null, { n: 3 }]);
  });

  it('says which part of what it requires does not hold (the core group named as such)', () => {
    const { host, served, available } = setup();
    available.value = new Set(['v1beta1.metrics.k8s.io']);
    host.register(named('m', 'addon', () => {}, { requires: { served: 'metrics.k8s.io', available: 'v1beta1.metrics.k8s.io' } }));
    expect(host.status('m')?.reason).toBe('metrics.k8s.io is not served');
    served.value = new Set(['metrics.k8s.io']);
    available.value = new Set();
    expect(host.status('m')?.reason).toBe('v1beta1.metrics.k8s.io is not available');
    host.register(named('core-user', 'addon', () => {}, { requires: { served: '' } }));
    expect(host.status('core-user')?.reason).toBe('the core group is not served');
  });
});
