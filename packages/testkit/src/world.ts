import type { KindInfo } from '@overkube/kube-types';
import { type Addon, type Cluster, type Ctx, type KubeContributor, kubeOwnKinds, type SetupResult, standingOf, ui } from '@overkube/sdk';
import { type Run, uiWorld } from '@overweave/testkit';
import { effect, signal } from '@preact/signals';
import { type FakeCluster, fakeCluster } from './cluster.ts';

/*
 * A world of the dashboard's kinds (overweave's testkit world), a cluster in
 * memory, and addons run in it as the page runs them: each a contributor at
 * its layer (its priority, its rights), given its ctx — the cluster (what it
 * holds let go of when it stops, what it writes in its name), the services
 * others provide (followed by effects), its signal, onDispose, effect,
 * guard. What it throws in a callback (or a promise of it rejects with) is
 * kept, as its failure; a setup that takes a while is waited for (ready). Not
 * the page's lifecycle (requires, retries, safe mode): an addon's setup is
 * run, and stopped.
 */

/** overweave's testkit world of the dashboard's kinds. */
export type KubeWorldBase = ReturnType<typeof uiWorld<typeof ui, typeof kubeOwnKinds>>;

export interface KubeWorld extends KubeWorldBase {
  readonly cluster: FakeCluster;
  /** An addon run, as the page runs it; its run (stop() takes back all it said and held). */
  addon(addon: Addon): Run<KubeContributor>;
  /** Once an addon's setup has finished (an async one's): what it failed with, thrown. */
  ready(id: string): Promise<void>;
  /** Stop a running addon. */
  stop(id: string): void;
  /** What an addon's callbacks (guarded, effects, onDispose, its setup's promise) threw. */
  failures(id: string): readonly unknown[];
  /** A service, while its provider runs. */
  service<T = unknown>(name: string): T | null;
}

/** What a run took: let go of all at once when it stops (each, whatever the others throw); once stopped, what is added after at once. */
function scope(failed: (error: unknown) => void) {
  const disposers: (() => void)[] = [];
  const controller = new AbortController();
  const run = (d: () => void) => {
    try {
      d();
    } catch (error) {
      failed(error);
    }
  };
  return {
    signal: controller.signal,
    get closed() {
      return controller.signal.aborted;
    },
    /** Kept until it stops; what it gives back drops it (let go of before). */
    add(dispose: () => void): () => void {
      if (controller.signal.aborted) {
        run(dispose);
        return () => {};
      }
      disposers.push(dispose);
      return () => {
        const at = disposers.indexOf(dispose);
        if (at >= 0) disposers.splice(at, 1);
      };
    },
    dispose() {
      controller.abort();
      for (const d of disposers.splice(0).reverse()) run(d);
    },
  };
}

/** The cluster for one run: what it holds is let go of when the run stops; what it writes is in its name; after, it writes nothing. */
function scoped(cluster: Cluster, run: ReturnType<typeof scope>, id: string): Cluster {
  const live = () => {
    if (run.signal.aborted) throw new Error('the addon has stopped: it writes nothing more');
  };
  const hold = (kind: KindInfo) => {
    const release = cluster.hold(kind);
    const drop = run.add(release);
    return () => {
      drop();
      release();
    };
  };
  return {
    collection(kind) {
      run.add(cluster.hold(kind));
      return cluster.peek(kind);
    },
    peek: (kind) => cluster.peek(kind),
    hold,
    served: (g) => cluster.served(g),
    status: (s) => cluster.status(s),
    patch: async (kind, object, change) => {
      live();
      return cluster.patch(kind, object, { fieldManager: `overkube-${id}`, ...change });
    },
    remove: async (kind, object) => {
      live();
      return cluster.remove(kind, object);
    },
  };
}

/** A world of the dashboard's kinds and a cluster in memory: kubeWorld(), kubeWorld({ cluster }). */
export function kubeWorld(options: { cluster?: FakeCluster } = {}): KubeWorld {
  const cluster = options.cluster ?? fakeCluster();
  const w = uiWorld(ui, ...kubeOwnKinds);
  const runs = new Map<string, Run<KubeContributor>>();
  const started = new Map<string, Promise<void>>();
  const failed = new Map<string, unknown[]>();
  const services = signal<ReadonlyMap<string, { provider: string; value: unknown }>>(new Map());

  const addon = (a: Addon): Run<KubeContributor> => {
    const failures: unknown[] = [];
    failed.set(a.id, failures);
    let finished: Promise<void> = Promise.resolve();
    const run = w.run(
      a.id,
      ((contributor: KubeContributor) => {
        const s = scope((error) => failures.push(error));
        const guard = (<A extends unknown[], R>(fn: (...args: A) => R) =>
          (...args: A) => {
            try {
              const out = fn(...args);
              if (out && typeof (out as unknown as PromiseLike<unknown>).then === 'function') {
                return Promise.resolve(out).catch((error) => {
                  failures.push(error);
                  return undefined;
                });
              }
              return out;
            } catch (error) {
              failures.push(error);
              return undefined;
            }
          }) as Ctx['guard'];
        const ctx: Ctx = {
          contributor,
          cluster: scoped(cluster, s, a.id),
          services: { get: <T>(name: string) => (services.value.get(name)?.value as T | undefined) ?? null },
          signal: s.signal,
          onDispose: (fn) => void s.add(guard(fn)),
          effect: (fn) => {
            // Once stopped, nothing runs (as on the page).
            if (s.closed) return;
            s.add(
              effect(() => {
                const cleanup = guard(fn)() as unknown;
                return typeof cleanup === 'function' ? guard(cleanup as () => void) : undefined;
              }),
            );
          },
          guard,
        };
        for (const [name, make] of Object.entries(a.provides ?? {})) {
          // Another's already: not taken from it (as on the page).
          const taken = services.peek().get(name);
          if (taken && taken.provider !== a.id) {
            failures.push(new Error(`${name} is provided by ${taken.provider} already`));
            continue;
          }
          services.value = new Map([...services.peek(), [name, { provider: a.id, value: make(ctx) }]]);
          s.add(() => {
            if (services.peek().get(name)?.provider !== a.id) return;
            const next = new Map(services.peek());
            next.delete(name);
            services.value = next;
          });
        }
        let own: SetupResult | Promise<SetupResult>;
        try {
          own = a.setup(ctx);
        } catch (error) {
          s.dispose();
          throw error;
        }
        const keep = (dispose: SetupResult) => {
          if (typeof dispose === 'function') s.add(dispose);
        };
        if (own && typeof (own as PromiseLike<SetupResult>).then === 'function') {
          // Waited for (ready): what it gives back kept (done at once if it stopped meanwhile); its failure stops it.
          finished = Promise.resolve(own).then(keep, (error) => {
            failures.push(error);
            runs.get(a.id)?.stop();
            runs.delete(a.id);
            throw error;
          });
          finished.catch(() => {});
        } else {
          keep(own as SetupResult);
        }
        return () => s.dispose();
      }) as never,
      standingOf(a.layer),
    ) as unknown as Run<KubeContributor>;
    runs.set(a.id, run);
    started.set(a.id, finished);
    return run;
  };

  return Object.assign(w, {
    cluster,
    addon,
    ready: (id: string) => started.get(id) ?? Promise.reject(new Error(`no addon ${id} was run`)),
    stop(id: string) {
      runs.get(id)?.stop();
      runs.delete(id);
    },
    failures: (id: string) => failed.get(id) ?? [],
    service: <T>(name: string) => (services.peek().get(name)?.value as T | undefined) ?? null,
  }) as unknown as KubeWorld;
}
