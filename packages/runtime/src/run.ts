import type { Addon, Cluster, Ctx, GuardedResult, KubeContributor, Notification, SetupResult } from '@overkube/sdk';
import { effect, type Signal } from '@preact/signals';
import { Scope } from './scope.ts';

/*
 * An addon run: its contributor (taken back when it stops), its ctx — the
 * cluster opened for it, the others' services (followed), notify and
 * dismiss (its notifications taken back when it stops, but for errors),
 * onDispose, effect, guard — its services made, its setup run. A setup that
 * throws, a service that cannot be made, a promise of a setup that rejects:
 * everything taken let go of, at once, and the failure told. What its
 * callbacks throw is told as its own while it runs, only said after.
 */

/** A service of an addon's, by name. */
export type Services = Signal<ReadonlyMap<string, { provider: string; value: unknown }>>;

/** Where an addon runs: what it is given, where what it does is told. */
export interface RunEnv {
  /** The cluster for this run: once signal aborts, it writes nothing. */
  open(run: { id: string; signal: AbortSignal }): Cluster;
  readonly services: Services;
  notify(notification: Notification, from: string): string;
  dismiss(id: string): void;
  /** What a callback of its threw while it runs (or a service of another's taken): its failure. */
  failed(id: string, error: unknown): void;
  /** Said only (after it stopped; what failed as it was let go of). */
  log(message: string): void;
}

export interface AddonRun {
  readonly id: string;
  readonly signal: AbortSignal;
  /** Its setup is async, not finished when it was run (ready tells when). */
  readonly pending: boolean;
  /** Done once its setup has finished (an async one's); rejected with what failed it — everything let go of by then. */
  readonly ready: Promise<void>;
  /** Everything it said and took, let go of. Again: nothing. */
  stop(): void;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const thenable = (v: unknown): v is PromiseLike<unknown> => !!v && (typeof v === 'object' || typeof v === 'function') && typeof (v as PromiseLike<unknown>).then === 'function';

/** Run an addon with its contributor: its setup thrown out of here (everything let go of first), an async one's failure in ready. */
export function runAddon(addon: Addon, contributor: KubeContributor, env: RunEnv): AddonRun {
  const id = addon.id;
  const scope = new Scope((error) => env.log(`${id}: stopping: ${message(error)}`));
  // Everything it said, taken back when it stops (added first: let go of last, after its services and effects).
  scope.add(() => contributor.dispose());

  const guard = <A extends unknown[], R>(fn: (...args: A) => R): ((...args: A) => GuardedResult<R>) => {
    const fail = (error: unknown) => {
      if (scope.closed) env.log(`${id}: after it stopped: ${message(error)}`);
      else env.failed(id, error);
      return undefined;
    };
    return (...args) => {
      try {
        const out = fn(...args);
        if (thenable(out)) return Promise.resolve(out).catch(fail) as GuardedResult<R>;
        return out as GuardedResult<R>;
      } catch (error) {
        return fail(error) as GuardedResult<R>;
      }
    };
  };

  // Its notifications, taken back when it stops (an error stays: the user should read why).
  const told = new Map<string, Notification>();
  scope.add(() => {
    for (const [nid, n] of told) if (n.level !== 'error') env.dismiss(nid);
  });

  const ctx: Ctx = {
    contributor,
    cluster: env.open({ id, signal: scope.controller.signal }),
    services: { get: <T>(name: string) => (env.services.value.get(name)?.value as T | undefined) ?? null },
    signal: scope.controller.signal,
    notify(n) {
      if (scope.closed) return '';
      const nid = env.notify(n, id);
      told.set(nid, n);
      return nid;
    },
    dismiss(nid) {
      told.delete(nid);
      env.dismiss(nid);
    },
    onDispose: (d) => void scope.add(guard(d)),
    effect(fn) {
      // Once stopped, nothing runs.
      if (scope.closed) return;
      scope.add(
        effect(() => {
          const cleanup = guard(fn)() as unknown;
          return typeof cleanup === 'function' ? guard(cleanup as () => void) : undefined;
        }),
      );
    },
    guard,
  };

  const keep = (dispose: SetupResult) => {
    if (typeof dispose === 'function') scope.add(dispose);
  };
  let own: SetupResult | Promise<SetupResult>;
  try {
    for (const [name, make] of Object.entries(addon.provides ?? {})) provide(env.services, scope, id, name, make(ctx), env);
    own = addon.setup(ctx);
  } catch (error) {
    scope.dispose();
    throw error;
  }
  const pending = thenable(own);
  const ready = thenable(own)
    ? Promise.resolve(own).then(keep, (error) => {
        // Failed later: let go of now, then told (ready rejects).
        scope.dispose();
        throw error;
      })
    : Promise.resolve(keep(own as SetupResult));
  ready.catch(() => {});
  return { id, signal: scope.controller.signal, pending, ready, stop: () => scope.dispose() };
}

/** A service given while its provider runs; another's already: not taken from it (its failure). */
function provide(services: Services, scope: Scope, id: string, name: string, value: unknown, env: RunEnv): void {
  const taken = services.peek().get(name);
  if (taken && taken.provider !== id) {
    env.failed(id, new Error(`${name} is provided by ${taken.provider} already`));
    return;
  }
  services.value = new Map([...services.peek(), [name, { provider: id, value }]]);
  scope.add(() => {
    if (services.peek().get(name)?.provider !== id) return;
    const next = new Map(services.peek());
    next.delete(name);
    services.value = next;
  });
}
