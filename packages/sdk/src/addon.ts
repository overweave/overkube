import type { ReachTarget } from '@overkube/gateway/protocol';
import type { UiContributor } from '@overweave/ui';
import type { ReadonlySignal } from '@preact/signals';
import type { Cluster } from './cluster.ts';
import type { kubeOwnKinds, Right, ui } from './kinds.ts';

/*
 * An addon: what it is (id, title), where it sits (its layer: its priority
 * and rights), when it can run (requires), what it answers to (answers:
 * said in Settings, and suggested by when it is off),
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

/** Whether a layer's addons are the dashboard's own: always on (none to turn off), the only ones run in safe mode — the core's, those built in. */
export const builtIn = (layer: Layer) => layer === 'core' || layer === 'builtin';

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

/** Something of the cluster or the page that must hold: a group served, an APIService available, a service another addon gives, a Service found. */
export interface Condition {
  /** A group ('metrics.k8s.io') or a kind ('v1/Pod') the cluster serves. */
  served?: string;
  /** An APIService that is Available ('v1beta1.metrics.k8s.io'). */
  available?: string;
  /** A service another addon provides. */
  service?: string;
  /** A Service in the cluster, as the one signed in may see it. */
  found?: Found;
}

/** A Service by its name (* any run of characters: vmsingle-*), one of these; and, said, a port it has (its number). */
export interface Found {
  service: string | readonly string[];
  port?: number;
}

/** What an addon answers to, said in Settings and checked in the cluster: its name there (VictoriaMetrics), the condition that finds it. */
export interface Answer {
  title: string;
  when: Condition;
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
  /** What it uses now, in words (VictoriaMetrics over time, metrics-server now): said in Settings; none, nothing. */
  using(words: string | undefined): void;
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
  /** What it answers to: each found here or not, in Settings; off (as an addon or a plugin is, until turned on) and one found, suggested. */
  readonly answers?: readonly Answer[];
  /** Services it gives others, made when it starts. */
  readonly provides?: Readonly<Record<string, (ctx: Ctx) => unknown>>;
  /** The workloads' ports it asks (its cluster's proxy: these, and where the Services its answers and requires look for are found — none other) — said where its settings are. */
  readonly reaches?: readonly ReachTarget[];
  /**
   * Its definitions; what it gives back is done when it stops. It may take a
   * while (async: what it needs first, fetched) — it is starting until it
   * has finished, given up on if it takes too long.
   */
  setup(ctx: Ctx): SetupResult | Promise<SetupResult>;
}

/** How an addon is doing, as the page tells it. */
export type AddonState = 'disabled' | 'unavailable' | 'starting' | 'running' | 'degraded' | 'crashloop' | 'failed';

/** One of what an addon answers to, as checked: found (and where: monitoring/vmsingle-main:8428), not, or not known yet. */
export interface AnswerStatus {
  title: string;
  found: boolean | undefined;
  where?: string;
}

/** An addon as the page runs it: what it is, how it is doing (and why), how often it failed. */
export interface AddonStatus {
  id: string;
  title: string;
  description?: string;
  layer: Layer;
  state: AddonState;
  /** Why, in words (what is missing, how long until it is tried again). */
  reason?: string;
  /** On: one of the core's or built in (always), or turned on by the user. */
  enabled: boolean;
  /** Off, one of what it answers to found, and not put off by the user. */
  suggested: boolean;
  /** What it answers to: found (where), not found, or not known yet. */
  answers: readonly AnswerStatus[];
  /** What it uses now, as it says. */
  using?: string;
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

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What is wrong with a Service looked for, if anything. */
function badFound(found: unknown): string | undefined {
  if (!isObject(found)) return 'found is not an object';
  for (const field of Object.keys(found)) if (field !== 'service' && field !== 'port') return `found: no field ${field} (service, port)`;
  const names = typeof found.service === 'string' ? [found.service] : found.service;
  if (!Array.isArray(names) || !names.length || names.some((n) => typeof n !== 'string' || !n)) return 'found: service is not a name, or names';
  if (found.port !== undefined && (!Number.isInteger(found.port) || (found.port as number) < 1 || (found.port as number) > 65535)) return 'found: port is not a port';
  return undefined;
}

/** What is wrong with a condition, if anything. */
function badCondition(condition: unknown): string | undefined {
  if (condition === undefined) return undefined;
  if (!isObject(condition)) return 'not an object';
  for (const [field, value] of Object.entries(condition)) {
    if (field === 'found') {
      const bad = badFound(value);
      if (bad) return bad;
      continue;
    }
    if (!['served', 'available', 'service'].includes(field)) return `no field ${field} (served, available, service, found)`;
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
  const bad = badCondition(addon.requires);
  if (bad) throw new Error(`addon ${addon.id}: requires: ${bad}`);
  for (const [i, answer] of (addon.answers ?? []).entries()) {
    if (!isObject(answer) || typeof answer.title !== 'string' || !answer.title) throw new Error(`addon ${addon.id}: answers[${i}]: no title`);
    const wrong = answer.when === undefined ? 'no condition' : badCondition(answer.when);
    if (wrong) throw new Error(`addon ${addon.id}: answers[${i}] (${answer.title}): ${wrong}`);
  }
  for (const t of addon.reaches ?? []) {
    if ((t.kind !== 'service' && t.kind !== 'pod') || !t.namespace || !t.name || t.port === undefined || t.port === '')
      throw new Error(`addon ${addon.id}: reaches ${JSON.stringify(t)}: a service's or a pod's port ({ kind, namespace, name, port })`);
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
