import { type Addon, type AddonChoicesSpec, column, defineAddon, type Found, kubeKinds, lazySetup, type ReachTarget } from '@overkube/sdk';
import { createRegistry } from '@overweave/core';
import { signal } from '@preact/signals';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddonHost } from './addons.ts';
import type { ClusterAccess } from './cluster.ts';

/*
 * The addons' host: each addon a contributor at its layer, what it said
 * taken back when it stops, started as what it requires comes and goes,
 * started again after its setup fails (then left alone), the safe mode,
 * services, a failure told as its owner's; an addon off until the user
 * turns it on, what it answers to checked, suggested.
 */

/** The user's choices with every addon turned on (as they may): the host's other ways tested apart from them. */
const allOn = (): AddonChoicesSpec => ({ on: new Proxy({}, { get: () => true }) });

const hosts: AddonHost[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.close();
  vi.useRealTimers();
});

/** A cluster whose facts the test sets: served groups, available APIServices, Services found (where); the user's choices (every addon on, unless said). */
function setup(options: { safe?: boolean; log?: (message: string) => void; choices?: AddonChoicesSpec } = {}) {
  const served = signal<Set<string> | null>(new Set(['']));
  const available = signal<Set<string>>(new Set());
  const found = signal<Record<string, ReachTarget | false | undefined>>({});
  const cluster: ClusterAccess = {
    facts: {
      served: (g) => (served.value ? served.value.has(g) : undefined),
      available: (a) => available.value.has(a),
      found: (spec: Found) => found.value[[spec.service].flat()[0]],
    },
    open: () => ({}) as never,
    components: () => ({}) as never,
    close() {},
  };
  const choices = signal<AddonChoicesSpec | undefined>(options.choices ?? allOn());
  const registry = createRegistry({ kinds: kubeKinds });
  const host = new AddonHost({ registry, cluster, choices, safe: options.safe, retryMs: 10, maxRetryMs: 40, maxCrashes: 3, log: options.log ?? (() => {}) });
  hosts.push(host);
  return { registry, host, served, available, found, choices };
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

  it('keeps an addon or a plugin off until the user turns it on — the core’s and the built-in ones always on', () => {
    const { host, choices } = setup({ choices: {} });
    host.register(named('core', 'core', () => {}));
    host.register(named('session', 'builtin', () => {}));
    host.register(named('metrics', 'addon', () => {}));
    expect(host.statuses.value.map((s) => [s.id, s.state, s.enabled])).toEqual([
      ['core', 'running', true],
      ['session', 'running', true],
      ['metrics', 'disabled', false],
    ]);
    choices.value = { on: { metrics: true, core: false } };
    expect([host.status('metrics')?.state, host.status('core')?.state]).toEqual(['running', 'running']);
    choices.value = { on: { metrics: false } };
    expect(host.status('metrics')?.state).toBe('disabled');
  });

  it('checks what an addon answers to — found where, not, not known yet — and suggests it, off, when one is found, unless put off', () => {
    const { host, available, found, choices } = setup({ choices: {} });
    host.register(
      named('metrics', 'addon', () => {}, {
        answers: [
          { title: 'metrics-server', when: { available: 'v1beta1.metrics.k8s.io' } },
          { title: 'VictoriaMetrics', when: { found: { service: 'vmsingle-*', port: 8428 } } },
        ],
      }),
    );
    expect(host.status('metrics')).toMatchObject({
      suggested: false,
      answers: [
        { title: 'metrics-server', found: false },
        { title: 'VictoriaMetrics', found: undefined },
      ],
    });
    found.value = { 'vmsingle-*': { kind: 'service', namespace: 'monitoring', name: 'vmsingle-main', port: 8428 } };
    available.value = new Set(['v1beta1.metrics.k8s.io']);
    expect(host.status('metrics')).toMatchObject({
      suggested: true,
      answers: [
        { title: 'metrics-server', found: true },
        { title: 'VictoriaMetrics', found: true, where: 'monitoring/vmsingle-main:8428' },
      ],
    });
    choices.value = { notNow: { metrics: true } };
    expect(host.status('metrics')?.suggested).toBe(false);
    choices.value = { on: { metrics: true } };
    expect(host.status('metrics')).toMatchObject({ state: 'running', suggested: false });
  });

  it('says what an addon uses now, as it says it — gone when it stops', () => {
    const { host, choices } = setup();
    host.register(named('metrics', 'addon', (ctx) => ctx.using('metrics-server now')));
    expect(host.status('metrics')?.using).toBe('metrics-server now');
    choices.value = { on: {} };
    expect(host.status('metrics')?.using).toBeUndefined();
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
      cluster: { facts: { served: () => true, available: () => true, found: () => false }, open: () => ({}) as never, components: () => ({}) as never, close() {} },
      choices: signal(allOn()),
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

  it('loads a setup in a module of its own once the addon is on — never while it is off; starting till its module is there, then set up', async () => {
    const { host, registry, choices, served } = setup({ choices: {} });
    served.value = null;
    let give: () => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<{ default: Addon['setup'] }>((done) => {
          give = () => done({ default: ({ contributor }) => void contributor.add('Column', 'lazy.c', col('Lazy')) });
        }),
    );
    host.register(named('lazy', 'addon', lazySetup(load), { requires: { served: 'example.com' } }));
    expect(load).not.toHaveBeenCalled();
    // On: its module asked for at once, while what it requires is not known yet (discovery to come).
    choices.value = { on: { lazy: true } };
    expect([load.mock.calls.length, host.status('lazy')?.state]).toEqual([1, 'unavailable']);
    served.value = new Set(['', 'example.com']);
    expect(host.status('lazy')?.state).toBe('starting');
    give();
    await expect.poll(() => host.status('lazy')?.state).toBe('running');
    expect([registry.get('Column', 'lazy.c') !== undefined, load.mock.calls.length]).toEqual([true, 1]);
    // Off and on again: its module not loaded again — set up at once.
    choices.value = { on: {} };
    choices.value = { on: { lazy: true } };
    expect([host.status('lazy')?.state, load.mock.calls.length]).toEqual(['running', 1]);
  });

  it('says a module that could not be loaded so, failed at once (a browser does not load it again till the page is reloaded); restarted, asks again', async () => {
    const { host, registry } = setup();
    const load = vi
      .fn<() => Promise<{ default: Addon['setup'] }>>()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValue({ default: ({ contributor }) => void contributor.add('Column', 'lazy.c', col('Lazy')) });
    host.register(named('lazy', 'addon', lazySetup(load)));
    await expect.poll(() => host.status('lazy')?.state).toBe('failed');
    expect([host.status('lazy')?.reason, host.status('lazy')?.error, host.status('lazy')?.restarts]).toEqual([
      'its module could not be loaded: reload the page',
      'Failed to fetch dynamically imported module',
      0,
    ]);
    // Not tried again by itself; one preload only, though what it requires was asked again meanwhile.
    expect(load).toHaveBeenCalledOnce();
    host.restart('lazy');
    await expect.poll(() => host.status('lazy')?.state).toBe('running');
    expect(registry.get('Column', 'lazy.c')).toBeDefined();
  });

  it('runs a setup whose module its preload has loaded at once, as what it requires comes — not starting for a moment', async () => {
    const { host, choices, served } = setup({ choices: {} });
    const load = vi.fn(async () => ({ default: (() => undefined) as Addon['setup'] }));
    host.register(named('lazy', 'addon', lazySetup(load), { requires: { served: 'example.com' } }));
    choices.value = { on: { lazy: true } };
    await new Promise((done) => setTimeout(done, 0));
    expect(host.status('lazy')?.state).toBe('unavailable');
    served.value = new Set(['', 'example.com']);
    expect(host.status('lazy')?.state).toBe('running');
    expect(load).toHaveBeenCalledOnce();
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
