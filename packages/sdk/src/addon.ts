import type { UiContributor } from '@overweave/ui';
import type { ReadonlySignal } from '@preact/signals';
import type { Cluster } from './cluster.ts';
import type { kubeOwnKinds, Right, ui } from './kinds.ts';

/*
 * An addon: what it is (id, title), where it sits (its layer: its priority
 * and rights), when it can run (requires) and when to suggest it (detect),
 * the services it gives others, and its setup — handed its context: a
 * contributor of the dashboard's registry, the cluster, and what lets it
 * keep its own in order. Everything it said or held goes when it stops.
 *
 * Running addons — turning them on and off, starting them again after a
 * failure, telling their states — is the page's (apps/web): the SDK says
 * only what an addon is and what it is given.
 */

/** Where an addon sits: the page's frame, its own features, addons, plugins (the user is above them all). */
export type Layer = 'core' | 'builtin' | 'addon' | 'plugin';

/** Each layer's priority: a field is what the highest that says it says. */
export const PRIORITY: Readonly<Record<Layer | 'user' | 'access', number>> = { core: 0, builtin: 100, addon: 200, plugin: 300, user: 1000, access: 2000 };

/** What each layer may say: every addon how things look and what they do; the user how things look. */
export const RIGHTS_OF: Readonly<Record<Layer | 'user' | 'access', readonly Right[]>> = {
  core: ['configure', 'behaviour'],
  builtin: ['configure', 'behaviour'],
  addon: ['configure', 'behaviour'],
  plugin: ['configure', 'behaviour'],
  user: ['configure'],
  // Over everyone: what the one signed in may not have, hidden (or marked: its own marks drawn) — and whether they may, its own word.
  access: ['configure', 'behaviour', 'access'],
};

/** A contributor of the dashboard's registry, with an addon's rights. */
export type KubeContributor = UiContributor<typeof ui, typeof kubeOwnKinds, Right>;

/** Something of the cluster or the page that must hold: a group served, an APIService available, a service another addon gives. */
export interface Condition {
  /** A group ('metrics.k8s.io') or a kind ('v1/Pod') the cluster serves. */
  served?: string;
  /** An APIService that is Available ('v1beta1.metrics.k8s.io'). */
  available?: string;
  /** A service another addon provides. */
  service?: string;
}

/** Something told the user (the page shows it, then lets it go). */
export interface Notification {
  level?: 'info' | 'ok' | 'warn' | 'error';
  title?: string;
  text: string;
  /** How long it is shown (default: a few seconds; an error until closed); 0: until closed. */
  timeoutMs?: number;
  /** One of its kind: a notification with the same key (and teller) replaces it, not stacks under it. */
  key?: string;
}

/** What an addon is given. */
export interface Ctx {
  /** Its contributor: what it adds and patches, at its layer's priority, with its rights; taken back when it stops. */
  readonly contributor: KubeContributor;
  /** The cluster: what it holds is let go of when it stops. */
  readonly cluster: Cluster;
  /**
   * Services of other addons, by name: null while none provides it. Read in
   * an effect, followed (one that comes, goes or is made anew runs it
   * again). T is the asker's word, not checked against the provider's.
   */
  readonly services: { get<T = unknown>(name: string): T | null };
  /** Aborted when it stops: its writes to the cluster in flight, and its own timers and requests (given it). */
  readonly signal: AbortSignal;
  /**
   * Tell the user something (as this addon): its id, to take it back
   * (dismiss). Taken back when it stops, but for errors; once it has
   * stopped, nothing told.
   */
  notify(notification: Notification): string;
  dismiss(id: string): void;
  /** Done when it stops (in the reverse order). */
  onDispose(fn: () => void): void;
  /** An effect over signals, run until it stops; what it throws is the addon's failure. */
  // biome-ignore lint/suspicious/noConfusingVoidType: an effect may give back nothing (no `return undefined` asked of it).
  effect(fn: () => void | (() => void)): void;
  /**
   * A function of its, guarded: what it throws — or the promise it gives
   * rejects with — is told as the addon's, not the page's; it gives
   * undefined then (a promise of undefined).
   */
  guard<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => GuardedResult<R>;
}

/** What a guarded function gives: its result, or undefined when it failed (a promise's: its value, or undefined). */
export type GuardedResult<R> = R extends PromiseLike<infer V> ? Promise<V | undefined> : R | undefined;

/** What a setup gives back, now or once it has finished: what is done when it stops, or nothing. */
// biome-ignore lint/suspicious/noConfusingVoidType: a setup may give back nothing (no `return undefined` asked of it).
export type SetupResult = undefined | (() => void) | void;

export interface Addon {
  /** Unique, lower-case: images, metrics, cert-manager. Its definitions' names start with it, by convention: images.tag. */
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  /** Default: addon. */
  readonly layer?: Layer;
  /** It runs only while this holds (Unavailable until, then starts by itself). */
  readonly requires?: Condition;
  /** Suggested, when off, while this holds. */
  readonly detect?: Condition;
  /** Services it gives others, made when it starts. */
  readonly provides?: Readonly<Record<string, (ctx: Ctx) => unknown>>;
  /**
   * Its definitions; what it gives back is done when it stops. It may take a
   * while (async: what it needs first, fetched) — it is starting until it
   * has finished, given up on if it takes too long.
   */
  setup(ctx: Ctx): SetupResult | Promise<SetupResult>;
}

/** How an addon is doing, as the page tells it. */
export type AddonState = 'disabled' | 'unavailable' | 'starting' | 'running' | 'degraded' | 'crashloop' | 'failed';

/** An addon as the page runs it: what it is, how it is doing (and why), how often it failed. */
export interface AddonStatus {
  id: string;
  title: string;
  description?: string;
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

/** The addons the page runs (its host's): each one's status, as it changes; one started again. */
export interface Addons {
  readonly statuses: ReadonlySignal<readonly AddonStatus[]>;
  restart(id: string): void;
}

const ID = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/;

/** Ids the page's own contributors have: no addon's. */
export const RESERVED_IDS: readonly string[] = ['user'];

const LAYERS: readonly string[] = ['core', 'builtin', 'addon', 'plugin'];

/** What is wrong with a condition, if anything. */
function badCondition(condition: unknown): string | undefined {
  if (condition === undefined) return undefined;
  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) return 'not an object';
  for (const [field, value] of Object.entries(condition)) {
    if (!['served', 'available', 'service'].includes(field)) return `no field ${field} (served, available, service)`;
    if (typeof value !== 'string' || (field !== 'served' && value === '')) return `${field} is not a name`;
  }
  return undefined;
}

/** An addon, checked: defineAddon({ id: 'images', title: 'Images', setup(ctx) { … } }). */
export function defineAddon<const A extends Addon>(addon: A): A & Addon {
  if (typeof addon.id !== 'string' || !ID.test(addon.id)) throw new Error(`addon id "${addon.id}": lower-case letters, digits, dashes, dots (images, cert-manager)`);
  if (RESERVED_IDS.includes(addon.id)) throw new Error(`addon id "${addon.id}": the page's own`);
  if (typeof addon.title !== 'string' || !addon.title) throw new Error(`addon ${addon.id}: no title`);
  if (typeof addon.setup !== 'function') throw new Error(`addon ${addon.id}: no setup`);
  if (addon.layer !== undefined && !LAYERS.includes(addon.layer)) throw new Error(`addon ${addon.id}: no layer ${addon.layer} (${LAYERS.join(', ')})`);
  for (const field of ['requires', 'detect'] as const) {
    const bad = badCondition(addon[field]);
    if (bad) throw new Error(`addon ${addon.id}: ${field}: ${bad}`);
  }
  for (const [name, make] of Object.entries(addon.provides ?? {})) {
    if (typeof make !== 'function') throw new Error(`addon ${addon.id}: provides ${name}: not a function (ctx => the service)`);
  }
  return Object.freeze(addon);
}

/** A layer's priority and rights (an addon's: standingOf(addon.layer); none: an addon's; the user's: standingOf('user')). */
export function standingOf(layer: Layer | 'user' | 'access' = 'addon'): { priority: number; rights: readonly Right[] } {
  return { priority: PRIORITY[layer], rights: RIGHTS_OF[layer] };
}
