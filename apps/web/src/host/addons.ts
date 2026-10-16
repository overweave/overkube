import { type AddonRun, type RunEnv, runAddon } from '@overkube/runtime';
import type { Addon, AddonStatus, Addons, KubeContributor, Layer, Notification } from '@overkube/sdk';
import { standingOf } from '@overkube/sdk';
import type { Registry } from '@overweave/core';
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
  /** How an addon tells the user something (the page's notifications); none: said in the log. */
  notify?: (notification: Notification, from: string) => string;
  /** A notification taken back. */
  dismiss?: (id: string) => void;
  log?: (message: string) => void;
}

const DEFAULTS = { startTimeoutMs: 10_000, retryMs: 1000, maxRetryMs: 60_000, maxCrashes: 5 };

/** Those that run in safe mode: the core's and the built-in ones. */
export const trusted = (layer: Layer) => layer === 'core' || layer === 'builtin';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface Runtime {
  addon: Addon;
  layer: Layer;
  enabled: Signal<boolean>;
  status: Signal<Omit<AddonStatus, 'enabled' | 'suggested'>>;
  /** Each start; a setup given up on (stopped, timed out) can no longer move it. */
  generation: number;
  run: AddonRun | null;
  crashes: number;
  retry?: ReturnType<typeof setTimeout>;
  drive?: () => void;
}

export class AddonHost implements Addons {
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
    this.env = {
      open: (run) => options.cluster.open(run),
      services,
      notify: (n, from) => {
        if (options.notify) return options.notify(n, from);
        this.log(`${from}: ${n.title ? `${n.title}: ` : ''}${n.text}`);
        return '';
      },
      dismiss: (id) => options.dismiss?.(id),
      failed: (id, error) => this.report(id, error),
      log: (m) => this.log(m),
    };
    // What the registry refuses an addon (a name another defines, a right it has not): its failure, not silence.
    this.unsubscribe = options.registry.subscribe((e) => {
      if (e.type !== 'rejected' || !this.runtimes.peek().has(e.contributor)) return;
      this.report(e.contributor, new Error(`${e.kind}/${e.name} refused: ${e.errors.map((x) => x.code).join(', ')}`));
    });
  }

  private readonly env: RunEnv;
  private readonly unsubscribe: () => void;

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
      status: signal({ id: addon.id, title: addon.title, ...(addon.description ? { description: addon.description } : {}), layer, state: 'disabled', restarts: 0, errors: 0 }),
      generation: 0,
      run: null,
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

  /** A definition's function failed (a render, a condition, a column's value): told as the addon's that says that field. */
  failed(definition: { kind: string; name: string }, field: string, error: unknown): void {
    const owner = this.ownerOf(definition.kind, definition.name, field);
    if (owner) this.report(owner, error);
    else this.log(`${definition.kind}/${definition.name}: ${message(error)}`);
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
    this.unsubscribe();
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
    this.update(rt, { state: 'starting', reason: undefined, errors: 0, error: undefined });
    let run: AddonRun;
    try {
      const contributor = this.options.registry.contributor(id, standingOf(rt.layer)) as unknown as KubeContributor;
      run = runAddon(rt.addon, contributor, this.env);
    } catch (error) {
      this.crash(rt, generation, error);
      return;
    }
    rt.run = run;
    const started = () => {
      rt.crashes = 0;
      const errors = rt.status.peek().errors;
      this.update(rt, { state: errors ? 'degraded' : 'running', reason: errors ? 'something it added failed' : undefined });
    };
    if (!run.pending) {
      started();
      return;
    }
    // Given up on if it takes too long; finished late (stopped meanwhile), what it gave back goes at once (its run's).
    const timer = setTimeout(() => this.crash(rt, generation, new Error(`setup did not finish in ${this.options.startTimeoutMs} ms`)), this.options.startTimeoutMs);
    run.ready.then(
      () => {
        clearTimeout(timer);
        if (generation === rt.generation) started();
      },
      (error) => {
        clearTimeout(timer);
        this.crash(rt, generation, error);
      },
    );
  }

  /** Let go of everything it took. */
  private stop(rt: Runtime): void {
    rt.generation++;
    clearTimeout(rt.retry);
    const run = rt.run;
    rt.run = null;
    run?.stop();
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
}
