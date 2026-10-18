import type { Addon, Cluster, KubeContributor, Notification } from '@overkube/sdk';
import { signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import { type RunEnv, runAddon } from './index.ts';

/*
 * An addon run, as everywhere it runs: its ctx; everything it took let go
 * of when it stops — and when it fails to start (a setup that throws, a
 * service that cannot be made, a promise that rejects); its notifications
 * taken back but for errors; nothing after it stops.
 */

function env() {
  const held: string[] = [];
  const told = new Map<string, Notification>();
  const failed: unknown[] = [];
  const said: string[] = [];
  const using = new Map<string, string>();
  let next = 0;
  const e: RunEnv = {
    open: () => ({}) as unknown as Cluster,
    services: signal(new Map()),
    notify: (n) => {
      const id = `n${++next}`;
      told.set(id, n);
      return id;
    },
    dismiss: (id) => void told.delete(id),
    failed: (_, error) => void failed.push(error),
    log: (m) => void said.push(m),
    using: (id, words) => void (words === undefined ? using.delete(id) : using.set(id, words)),
  };
  return { e, held, told, failed, said, using };
}

const contributor = () => {
  const c = { disposed: 0, dispose: () => c.disposed++ };
  return c as unknown as KubeContributor & { disposed: number };
};

const addon = (setup: Addon['setup'], more: Partial<Addon> = {}): Addon => ({ id: 'a', title: 'A', setup, ...more });

describe('runAddon', () => {
  it('lets go of everything when it stops: what it held, said, told (but errors), what it uses; nothing after', () => {
    const { e, held, told, using } = env();
    const c = contributor();
    let ran = 0;
    const run = runAddon(
      addon((ctx) => {
        held.push('v1/Pod');
        ctx.onDispose(() => held.splice(held.indexOf('v1/Pod'), 1));
        ctx.notify({ text: 'saved' });
        ctx.notify({ level: 'error', text: 'refused' });
        ctx.using('metrics-server now');
        ctx.effect(() => {
          ran++;
        });
      }),
      c,
      e,
    );
    expect([run.pending, held, told.size, ran, using.get('a')]).toEqual([false, ['v1/Pod'], 2, 1, 'metrics-server now']);
    run.stop();
    run.stop();
    expect([held, [...told.values()].map((n) => n.text), c.disposed, using.has('a')]).toEqual([[], ['refused'], 1, false]);
  });

  it('lets go of what it took when its setup throws, or a service cannot be made', () => {
    const { e, held } = env();
    const c = contributor();
    expect(() =>
      runAddon(
        addon(
          (ctx) => {
            held.push('v1/Pod');
            ctx.onDispose(() => held.splice(held.indexOf('v1/Pod'), 1));
            throw new Error('no luck');
          },
          { provides: { first: () => 1 } },
        ),
        c,
        e,
      ),
    ).toThrow('no luck');
    expect([held, e.services.value.size, c.disposed]).toEqual([[], 0, 1]);
    const d = contributor();
    expect(() =>
      runAddon(
        addon(() => {}, {
          provides: {
            first: () => 1,
            second: () => {
              throw new Error('cannot make it');
            },
          },
        }),
        d,
        e,
      ),
    ).toThrow('cannot make it');
    expect([e.services.value.size, d.disposed]).toEqual([0, 1]);
  });

  it('lets go of what an async setup took when its promise rejects, before ready says so', async () => {
    const { e, held } = env();
    const c = contributor();
    const run = runAddon(
      addon(async (ctx) => {
        held.push('v1/Pod');
        ctx.onDispose(() => held.splice(held.indexOf('v1/Pod'), 1));
        throw new Error('later');
      }),
      c,
      e,
    );
    expect(run.pending).toBe(true);
    await expect(run.ready).rejects.toThrow('later');
    expect([held, c.disposed]).toEqual([[], 1]);
  });

  it('tells what a callback throws as its own while it runs, only says it after', async () => {
    const { e, failed, said } = env();
    let later: () => unknown = () => {};
    const run = runAddon(
      addon((ctx) => {
        later = ctx.guard(() => {
          throw new Error('late');
        });
      }),
      contributor(),
      e,
    );
    later();
    run.stop();
    later();
    expect([failed.map((x) => (x as Error).message), said]).toEqual([['late'], ['a: after it stopped: late']]);
  });
});
