import { runAddon } from '@overkube/runtime';
import { type Addon, type AddonStatus, type Cluster, type KubeContributor, kubeOwnKinds, standingOf, ui } from '@overkube/sdk';
import { memoryStore, type Notifications, notifications, UserService } from '@overkube/shell';
import { type AddonRun, type Run, uiWorld } from '@overweave/testkit';
import { type Signal, signal } from '@preact/signals';
import { type FakeCluster, fakeCluster } from './cluster.ts';

/*
 * A world of the dashboard's kinds (overweave's testkit world), a cluster in
 * memory, and addons run in it as the page runs them: each a contributor at
 * its layer (its priority, its rights), given its ctx — the cluster (what it
 * writes in its name, nothing once it stops), the services
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
  /** What addons told the user (ctx.notify), as the page keeps it — a page drawn of the world shows them. */
  readonly notifications: Notifications;
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
  /** The user's changes, as the page keeps them (in memory): w.user.patch('TableView', 'v1/Pod', { widths: { 'core.name': 240 } }). */
  readonly user: UserService;
  /** The page's language, as its user would set it (Language): w.language('pl'). */
  language(locale: string): void;
  /** Its addons as the page's host tells them: each run, running (a test says otherwise: statuses.value); one started again, running. */
  readonly addons: { readonly statuses: Signal<readonly AddonStatus[]>; restart(id: string): void };
}

/** The cluster for one run: what it writes is in its name; after it stops, it writes nothing. */
function scoped(cluster: Cluster, run: { id: string; signal: AbortSignal }): Cluster {
  const live = () => {
    if (run.signal.aborted) throw new Error('the addon has stopped: it writes nothing more');
  };
  return {
    discovery: cluster.discovery,
    source: cluster.source,
    served: (g) => cluster.served(g),
    status: (s) => cluster.status(s),
    patch: async (kind, object, change) => {
      live();
      return cluster.patch(kind, object, { fieldManager: `overkube-${run.id}`, ...change });
    },
    remove: async (kind, object) => {
      live();
      return cluster.remove(kind, object);
    },
  };
}

/** What addons run beside one another share: the cluster, what they tell the user, their services, what they threw. */
export interface AddonEnv {
  readonly cluster: FakeCluster;
  readonly notifications: Notifications;
  readonly services: Signal<ReadonlyMap<string, { provider: string; value: unknown }>>;
  /** What an addon threw (its callbacks, its setup's promise, a service of another's it would give; after it stopped too), by its id. */
  failures(id: string): unknown[];
}

/** Addons' shared things: a cluster (in memory, unless given), notifications. */
export function addonEnv(cluster: FakeCluster = fakeCluster(), told: Notifications = notifications()): AddonEnv {
  const failed = new Map<string, unknown[]>();
  return {
    cluster,
    notifications: told,
    services: signal(new Map()),
    failures(id) {
      const kept = failed.get(id);
      if (kept) return kept;
      const list: unknown[] = [];
      failed.set(id, list);
      return list;
    },
  };
}

/**
 * An addon as overweave's testkit runs one (and its Storybook panel turns on
 * and off): its id, its layer's grant, a setup handed its contributor — run
 * as the page runs it (@overkube/runtime), over what it shares with the
 * others (env). An async setup: on.finished is given its promise; failing
 * later, everything is let go of, then on.failedLater told.
 */
export function addonRun(a: Addon, env: AddonEnv, on: { finished?(done: Promise<void>): void; failedLater?(error: unknown): void } = {}): AddonRun {
  const failures = () => env.failures(a.id);
  const setup = (contributor: KubeContributor) => {
    const run = runAddon(a, contributor, {
      open: (r) => scoped(env.cluster, r),
      services: env.services,
      notify: (n, from) => env.notifications.notify(n, from),
      dismiss: (id) => env.notifications.dismiss(id),
      failed: (_, error) => void failures().push(error),
      log: (message) => void failures().push(new Error(message)),
    });
    if (run.pending) {
      const done = run.ready.catch((error) => {
        failures().push(error);
        on.failedLater?.(error);
        throw error;
      });
      done.catch(() => {});
      on.finished?.(done);
    }
    return () => run.stop();
  };
  return { id: a.id, setup: setup as AddonRun['setup'], grant: standingOf(a.layer) };
}

/** A world of the dashboard's kinds and a cluster in memory: kubeWorld(), kubeWorld({ cluster }). */
export function kubeWorld(options: { cluster?: FakeCluster } = {}): KubeWorld {
  const env = addonEnv(options.cluster ?? fakeCluster());
  const { cluster, services } = env;
  const w = uiWorld(ui, ...kubeOwnKinds);
  // The fields its addons define, asked by.
  cluster.follow(w.registry);
  // The user's changes, kept in memory: nothing kept to read back, so made at once.
  const user = new UserService({ registry: w.registry as never, store: memoryStore() });
  void user.start();
  // Gone with the world: nothing it waits to save outlives it.
  const dispose = w.dispose.bind(w);
  w.dispose = () => {
    void user.close();
    dispose();
  };
  const runs = new Map<string, Run<KubeContributor>>();
  const started = new Map<string, Promise<void>>();
  const statuses = signal<readonly AddonStatus[]>([]);

  const addon = (a: Addon): Run<KubeContributor> => {
    env.failures(a.id).splice(0);
    let finished: Promise<void> = Promise.resolve();
    const r = addonRun(a, env, {
      finished: (done) => {
        finished = done;
      },
      failedLater: () => {
        runs.get(a.id)?.stop();
        runs.delete(a.id);
      },
    });
    const run = w.run(r.id, r.setup as never, r.grant) as unknown as Run<KubeContributor>;
    runs.set(a.id, run);
    started.set(a.id, finished);
    const status: AddonStatus = {
      id: a.id,
      title: a.title,
      ...(a.description ? { description: a.description } : {}),
      layer: a.layer ?? 'addon',
      state: 'running',
      enabled: true,
      suggested: false,
      restarts: 0,
      errors: 0,
    };
    statuses.value = [...statuses.peek().filter((s) => s.id !== a.id), status];
    return run;
  };

  return Object.assign(w, {
    cluster,
    notifications: env.notifications,
    addon,
    ready: (id: string) => started.get(id) ?? Promise.reject(new Error(`no addon ${id} was run`)),
    stop(id: string) {
      runs.get(id)?.stop();
      runs.delete(id);
      statuses.value = statuses.peek().filter((s) => s.id !== id);
    },
    failures: (id: string) => env.failures(id),
    service: <T>(name: string) => (services.peek().get(name)?.value as T | undefined) ?? null,
    user,
    language(locale: string) {
      user.patch('Language', 'default', { locale });
    },
    addons: {
      statuses,
      restart: (id: string) => {
        statuses.value = statuses.peek().map((s) => (s.id === id ? { ...s, state: 'running', restarts: s.restarts + 1 } : s));
      },
    },
  }) as unknown as KubeWorld;
}
