import type { Addon, AddonState, Ctx, GuardedResult, KubeContributor, Layer } from '@overkube/sdk';
import { standingOf } from '@overkube/sdk';
import type { Registry } from '@overweave/core';
import type { Failure } from '@overweave/ui';
import { computed, effect, type ReadonlySignal, type Signal, signal, untracked } from '@preact/signals';
import type { ClusterAccess } from './cluster.ts';
import { type Facts, holds } from './conditions.ts';

/*
 * The addons' host: starts and stops them as what they require comes and
 * goes, gives each a contributor of the registry at its layer (its priority
 * and rights) and keeps what it took in its run's scope — everything it said
 * taken back, everything it held let go of, when it stops — and keeps one's
 * failures its own:
 *
 *   disabled      off (in safe mode, every one but the core's and the built-in ones)
 *   unavailable   on, but what it requires does not hold (or is not known yet); starts by itself once it does
 *   starting      its setup runs
 *   running
 *   degraded      running, but something it drew or gave failed
 *   crashloop     its setup failed: started again after a wait that grows
 *   failed        its setup failed maxCrashes times in a row: left alone until restarted
 */

export interface AddonStatus {
  id: string;
  title: string;
  layer: Layer;
  state: AddonState;
  /** Why, in words (what is missing, how long until it is tried again). */
  reason?: string;
  enabled: boolean;
  /** Off, and what it detects is there. */
  suggested: boolean;
  restarts: number;
  errors: number;
  /** Its last error. */
  error?: string;
}

// biome-ignore lint/suspicious/noExplicitAny: a registry of the dashboard's kinds, whatever their types.
type AnyRegistry = Registry<any>;

export interface HostOptions {
  registry: AnyRegistry;
  cluster: ClusterAccess;
  /** Only the core's and the built-in addons start (?safe). */
  safe?: boolean;
  /** Which are on (default: every one; there is no turning them off yet). */
  enabled?: (addon: Addon) => boolean;
  /** How long setup may take. */
  startTimeoutMs?: number;
  /** The first wait before a failed setup is tried again; doubled up to maxRetryMs. */
  retryMs?: number;
  maxRetryMs?: number;
  /** Failed setups in a row before it is left alone. */
  maxCrashes?: number;
  log?: (message: string) => void;
}

const DEFAULTS = { startTimeoutMs: 10_000, retryMs: 1000, maxRetryMs: 60_000, maxCrashes: 5 };

/** Those that run in safe mode: the core's and the built-in ones. */
export const trusted = (layer: Layer) => layer === 'core' || layer === 'builtin';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What one run took: let go of all at once when it stops; once stopped, what is added after is let go of at once. */
class Scope {
  readonly controller = new AbortController();
  private readonly disposers: (() => void)[] = [];
  constructor(private readonly onError: (error: unknown) => void) {}

  get closed(): boolean {
    return this.controller.signal.aborted;
  }

  /** Kept until it stops; what it gives back drops it (let go of before, by its owner). */
  add(dispose: () => void): () => void {
    if (this.closed) {
      this.run(dispose);
      return () => {};
    }
    this.disposers.push(dispose);
    return () => {
      const at = this.disposers.indexOf(dispose);
      if (at >= 0) this.disposers.splice(at, 1);
    };
  }

  dispose(): void {
    this.controller.abort();
    for (const d of this.disposers.splice(0).reverse()) this.run(d);
  }

  private run(d: () => void): void {
    try {
      d();
    } catch (error) {
      this.onError(error);
    }
  }
}

interface Runtime {
  addon: Addon;
  layer: Layer;
  enabled: Signal<boolean>;
  status: Signal<Omit<AddonStatus, 'enabled' | 'suggested'>>;
  /** Each start; a setup given up on (stopped, timed out) can no longer move it. */
  generation: number;
  scope: Scope | null;
  crashes: number;
  retry?: ReturnType<typeof setTimeout>;
  drive?: () => void;
}

export class AddonHost {
  private readonly options: typeof DEFAULTS & HostOptions;
  private readonly runtimes = signal<ReadonlyMap<string, Runtime>>(new Map());
  private readonly services = signal<ReadonlyMap<string, { provider: string; value: unknown }>>(new Map());
  private readonly log: (message: string) => void;
  readonly facts: Facts;

  constructor(options: HostOptions) {
    this.options = { ...DEFAULTS, ...options };
    this.log = options.log ?? ((m) => console.warn(`[overkube] ${m}`));
    const services = this.services;
    this.facts = {
      served: (g) => options.cluster.facts.served(g),
      available: (a) => options.cluster.facts.available(a),
      service: (name) => services.value.has(name),
    };
  }

  /** Every addon's status, as it changes. */
  readonly statuses: ReadonlySignal<AddonStatus[]> = computed(() =>
    [...this.runtimes.value.values()].map((rt) => {
      const enabled = rt.enabled.value;
      const detect = rt.addon.detect;
      return { ...rt.status.value, enabled, suggested: !enabled && !!detect && this.holds(rt, detect) === true };
    }),
  );

  status(id: string): AddonStatus | undefined {
    return this.statuses.value.find((s) => s.id === id);
  }

  /** An addon's condition; one that throws does not hold. */
  private holds(rt: Runtime, condition: Addon['requires']): boolean | undefined {
    try {
      return holds(condition, this.facts);
    } catch (error) {
      this.log(`${rt.addon.id}: its condition threw: ${message(error)}`);
      return false;
    }
  }

  private runs(rt: Runtime): boolean {
    return rt.enabled.value && !(this.options.safe && !trusted(rt.layer));
  }

  /** One more addon: it starts as soon as it is on and what it requires holds. */
  register(addon: Addon): void {
    if (this.runtimes.peek().has(addon.id)) throw new Error(`an addon ${addon.id} is registered already`);
    const layer = addon.layer ?? 'addon';
    const rt: Runtime = {
      addon,
      layer,
      enabled: signal(this.options.enabled ? this.options.enabled(addon) : true),
      status: signal({ id: addon.id, title: addon.title, layer, state: 'disabled', restarts: 0, errors: 0 }),
      generation: 0,
      scope: null,
      crashes: 0,
    };
    this.runtimes.value = new Map([...this.runtimes.peek(), [addon.id, rt]]);
    rt.drive = effect(() => {
      const on = this.runs(rt);
      const requires = on ? this.holds(rt, addon.requires) : false;
      untracked(() => this.reconcile(rt, on, requires));
    });
  }

  /** Start one again: after it failed, or to begin it anew. */
  restart(id: string): void {
    const rt = this.runtimes.peek().get(id);
    if (!rt) return;
    rt.crashes = 0;
    this.stop(rt);
    this.update(rt, { state: 'disabled', reason: undefined });
    this.reconcile(
      rt,
      untracked(() => this.runs(rt)),
      this.holds(rt, rt.addon.requires),
    );
  }

  /** A service, while its provider runs: read in an effect, followed. */
  service<T>(name: string): T | null {
    return (this.services.value.get(name)?.value as T | undefined) ?? null;
  }

  /**
   * An error of an addon's (a render, a column's value, a callback): it is
   * degraded — the rest of the page goes on.
   */
  report(id: string, error: unknown): void {
    const rt = this.runtimes.peek().get(id);
    if (!rt) return;
    const status = rt.status.peek();
    const active = status.state === 'running' || status.state === 'degraded';
    this.update(rt, { errors: status.errors + 1, error: message(error), ...(active ? { state: 'degraded' as const, reason: 'something it added failed' } : {}) });
  }

  /** A failure of the page's drawing (overweave's), told as the addon's that says what failed: its render, or its condition. */
  fail(failure: Failure): void {
    const { kind, name } = failure.definition;
    const field = failure.phase === 'when' ? 'when' : failure.phase === 'match' ? 'target' : 'render';
    const owner = this.ownerOf(kind, name, field);
    if (owner) this.report(owner, failure.error);
    else this.log(`${kind}/${name}: ${message(failure.error)}`);
  }

  /** Who says a field of a definition: the strongest contribution saying it. */
  ownerOf(kind: string, name: string, field: string): string | undefined {
    const said = this.options.registry
      .inspect(kind, name)
      .contributions.filter((c) => c.status === 'included' && c.leaves.some((l) => l.path[0] === field))
      .sort((a, b) => b.priority - a.priority || b.tieBreak - a.tieBreak);
    return said[0]?.contributor;
  }

  /** Stop everything. */
  close(): void {
    for (const rt of this.runtimes.peek().values()) {
      rt.drive?.();
      this.stop(rt);
    }
  }

  private update(rt: Runtime, patch: Partial<Runtime['status']['value']>): void {
    rt.status.value = { ...rt.status.peek(), ...patch };
  }

  private reconcile(rt: Runtime, on: boolean, requires: boolean | undefined): void {
    const state = rt.status.peek().state;
    const active = state === 'starting' || state === 'running' || state === 'degraded' || state === 'crashloop';
    if (!on) {
      if (active) this.stop(rt);
      rt.crashes = 0;
      this.update(rt, { state: 'disabled', reason: rt.enabled.peek() && this.options.safe ? 'safe mode' : undefined });
      return;
    }
    if (requires !== true) {
      // Failed stays failed until restarted (what it requires coming and going does not try it again).
      if (state === 'failed') return;
      if (active) this.stop(rt);
      rt.crashes = 0;
      this.update(rt, { state: 'unavailable', reason: requires === undefined ? 'not known yet' : this.missing(rt) });
      return;
    }
    if (!active && state !== 'failed') this.start(rt);
  }

  private missing(rt: Runtime): string {
    // What does not hold, of what it requires.
    const r = rt.addon.requires;
    if (r?.served !== undefined && this.facts.served(r.served) === false) return `${r.served || 'the core group'} is not served`;
    if (r?.available !== undefined && this.facts.available(r.available) === false) return `${r.available} is not available`;
    if (r?.service !== undefined && !this.facts.service(r.service)) return `no addon provides ${r.service}`;
    return 'what it requires does not hold';
  }

  private start(rt: Runtime): void {
    clearTimeout(rt.retry);
    const generation = ++rt.generation;
    const id = rt.addon.id;
    const scope = new Scope((error) => this.log(`${id}: stopping: ${message(error)}`));
    rt.scope = scope;
    this.update(rt, { state: 'starting', reason: undefined, errors: 0, error: undefined });

    let result: unknown;
    try {
      const contributor = this.options.registry.contributor(id, standingOf(rt.layer)) as unknown as KubeContributor;
      // Everything it said, taken back when it stops (first: its services and effects go before it).
      scope.add(() => contributor.dispose());
      const ctx = this.ctx(rt, scope, contributor);
      for (const [name, make] of Object.entries(rt.addon.provides ?? {})) this.provide(rt, scope, name, make(ctx));
      result = rt.addon.setup(ctx);
    } catch (error) {
      this.crash(rt, generation, error);
      return;
    }
    const done = (dispose: unknown) => {
      if (generation !== rt.generation) {
        // Given up on meanwhile: what it gave back goes at once.
        if (typeof dispose === 'function') this.guarded(id, scope, dispose as () => void)();
        return;
      }
      clearTimeout(timer);
      if (typeof dispose === 'function') scope.add(dispose as () => void);
      rt.crashes = 0;
      const errors = rt.status.peek().errors;
      this.update(rt, { state: errors ? 'degraded' : 'running', reason: errors ? 'something it added failed' : undefined });
    };
    const timer = setTimeout(() => this.crash(rt, generation, new Error(`setup did not finish in ${this.options.startTimeoutMs} ms`)), this.options.startTimeoutMs);
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      (result as PromiseLike<unknown>).then(done, (error) => {
        clearTimeout(timer);
        this.crash(rt, generation, error);
      });
    } else {
      done(result);
    }
  }

  /** Let go of everything it took. */
  private stop(rt: Runtime): void {
    rt.generation++;
    clearTimeout(rt.retry);
    const scope = rt.scope;
    rt.scope = null;
    scope?.dispose();
  }

  /** Setup failed: started again after a wait, or, after maxCrashes in a row, left failed. */
  private crash(rt: Runtime, generation: number, error: unknown): void {
    if (generation !== rt.generation) return;
    this.stop(rt);
    rt.crashes++;
    const restarts = rt.status.peek().restarts;
    if (rt.crashes >= this.options.maxCrashes) {
      this.update(rt, { state: 'failed', reason: `its setup failed ${rt.crashes} times in a row`, error: message(error) });
      this.log(`${rt.addon.id}: failed ${rt.crashes} times in a row, left alone: ${message(error)}`);
      return;
    }
    const wait = Math.min(this.options.retryMs * 2 ** (rt.crashes - 1), this.options.maxRetryMs);
    this.update(rt, { state: 'crashloop', reason: `tried again in ${Math.round(wait / 1000)} s`, error: message(error), restarts: restarts + 1 });
    rt.retry = setTimeout(() => {
      if (rt.status.peek().state === 'crashloop') this.start(rt);
    }, wait);
  }

  private provide(rt: Runtime, scope: Scope, name: string, value: unknown): void {
    const taken = this.services.peek().get(name);
    if (taken && taken.provider !== rt.addon.id) {
      this.log(`${rt.addon.id}: ${name} is provided by ${taken.provider} already; not provided again`);
      return;
    }
    this.services.value = new Map([...this.services.peek(), [name, { provider: rt.addon.id, value }]]);
    scope.add(() => {
      if (this.services.peek().get(name)?.provider !== rt.addon.id) return;
      const next = new Map(this.services.peek());
      next.delete(name);
      this.services.value = next;
    });
  }

  /** A function of an addon's, its throw (or its promise's rejection) the addon's — or, after its run stopped, only said. */
  private guarded<A extends unknown[], R>(id: string, scope: Scope, fn: (...args: A) => R): (...args: A) => GuardedResult<R> {
    const failed = (error: unknown) => {
      if (scope.closed) this.log(`${id}: after it stopped: ${message(error)}`);
      else this.report(id, error);
      return undefined;
    };
    return (...args) => {
      try {
        const out = fn(...args);
        if (out && typeof (out as unknown as PromiseLike<unknown>).then === 'function') return Promise.resolve(out).catch(failed) as GuardedResult<R>;
        return out as GuardedResult<R>;
      } catch (error) {
        return failed(error) as GuardedResult<R>;
      }
    };
  }

  private ctx(rt: Runtime, scope: Scope, contributor: KubeContributor): Ctx {
    const id = rt.addon.id;
    return {
      contributor,
      cluster: this.options.cluster.open({ id, onDispose: (dispose) => scope.add(dispose), signal: scope.controller.signal }),
      services: { get: <T>(name: string) => this.service<T>(name) },
      signal: scope.controller.signal,
      onDispose: (dispose) => void scope.add(this.guarded(id, scope, dispose)),
      effect: (fn) => {
        if (scope.closed) return;
        scope.add(
          effect(() => {
            const cleanup = this.guarded(id, scope, fn)() as unknown;
            return typeof cleanup === 'function' ? this.guarded(id, scope, cleanup as () => void) : undefined;
          }),
        );
      },
      guard: (fn) => this.guarded(id, scope, fn),
    };
  }
}
