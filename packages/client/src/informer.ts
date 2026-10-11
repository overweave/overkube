import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { batch, type ReadonlySignal, signal } from '@preact/signals';
import { type Api, ApiError, collectionPath, type Status } from './api.ts';
import type { WatchEvent, Watcher, WatchStream } from './stream.ts';
import type { CollectionState } from './types.ts';

/*
 * One kind's objects across the cluster, kept current: listed once, then
 * watched over the page's streams from the list's resourceVersion. A watch
 * that has gone too far behind (410 Gone) is listed again — after a wait
 * that grows while it keeps happening; while its stream is down, what is
 * there stays (stale) until the watch opens again.
 */

/**
 * - loading: nothing yet;
 * - live: listed, and kept current by its watch (open, or opening);
 * - stale: what is there may be behind (its stream is down, the watch is
 *   tried again, a list is retried, it waits for room on a stream);
 * - error: it cannot be had (403: not allowed, 404: not served, the session
 *   is over): `error` says why; retry() tries again;
 * - absent: the cluster does not serve the kind (discovery): an addon's API not installed.
 */

export interface InformerOptions {
  /** The first wait before a failed list (or a list again after 410s in a row) is tried; doubled up to maxRetryMs. */
  retryMs?: number;
  maxRetryMs?: number;
  /** How often a kind that cannot be watched (no watch verb: ComponentStatus) is listed again. */
  pollMs?: number;
}

/** The key of an object in its collection: namespace/name, or the name of a cluster-wide one. */
function objectKey(object: { metadata?: { name?: string; namespace?: string } }): string {
  const { name = '', namespace } = object.metadata ?? {};
  return namespace ? `${namespace}/${name}` : name;
}

export class Informer<T extends KubeObject = KubeObject> implements Watcher {
  /** As discovery last said it (its verbs, its plural): rekind() takes a newer one. */
  kind: KindInfo;
  readonly id: string;
  path: string;
  private readonly itemsSignal = signal<ReadonlyMap<string, T>>(new Map());
  private readonly stateSignal = signal<CollectionState>('loading');
  private readonly errorSignal = signal<ApiError | null>(null);
  private readonly api: Api;
  private readonly stream: WatchStream;
  private readonly retryMs: number;
  private readonly maxRetryMs: number;
  private readonly pollMs: number;
  /** What there is, changed in place; published to `items` once per batch of events. */
  private data = new Map<string, T>();
  private version = '';
  private running = false;
  private listed = false;
  /** Failed lists in a row. */
  private attempt = 0;
  /** 410s in a row, with no event between: each list again waits longer. */
  private gone = 0;
  private controller: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private publishing = false;

  constructor(kind: KindInfo, api: Api, stream: WatchStream, options: InformerOptions = {}) {
    this.kind = kind;
    this.id = kind.id;
    this.path = collectionPath(kind);
    this.api = api;
    this.stream = stream;
    this.retryMs = options.retryMs ?? 1000;
    this.maxRetryMs = options.maxRetryMs ?? 30_000;
    this.pollMs = options.pollMs ?? 30_000;
  }

  /** The objects, by objectKey; a new map whenever they change. */
  get items(): ReadonlySignal<ReadonlyMap<string, T>> {
    return this.itemsSignal;
  }

  get state(): ReadonlySignal<CollectionState> {
    return this.stateSignal;
  }

  get error(): ReadonlySignal<ApiError | null> {
    return this.errorSignal;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.set(this.listed ? 'stale' : 'loading', this.errorSignal.peek());
    void this.load();
  }

  /** Stop listing and watching; what there is stays. */
  stop(): void {
    this.running = false;
    this.controller?.abort();
    this.controller = null;
    clearTimeout(this.retryTimer);
    this.stream.remove(this.id);
  }

  /** After an error: begin again (a list, then the watch). */
  retry(): void {
    if (this.running || this.stateSignal.peek() !== 'error') return;
    this.attempt = 0;
    this.gone = 0;
    this.start();
  }

  /**
   * The kind as discovery says it now: one whose path or verbs changed (a
   * CRD updated: watchable now, or no longer) is listed and watched anew,
   * its signals the same.
   */
  rekind(kind: KindInfo): void {
    if (kind.id !== this.id) return;
    const path = collectionPath(kind);
    const changed = path !== this.path || kind.verbs.join() !== this.kind.verbs.join();
    this.kind = kind;
    if (!changed) return;
    this.path = path;
    if (!this.running) return;
    this.stop();
    this.start();
  }

  /** Whether it stopped for good on an error (403, a refused watch): only retry() starts it again. */
  get failed(): boolean {
    return !this.running && this.stateSignal.peek() === 'error';
  }

  /** Stopped, and nothing to show: the kind is not served. */
  absent(): void {
    this.clear('absent');
  }

  /** Stopped, what there was let go (memory): started again, it lists anew. Its signals stay the same. */
  forget(): void {
    this.clear('loading');
  }

  private clear(state: CollectionState): void {
    this.stop();
    this.data = new Map();
    this.listed = false;
    this.version = '';
    batch(() => {
      this.itemsSignal.value = new Map();
      this.set(state, null);
    });
  }

  // ── Watcher ──

  resourceVersion(): string {
    return this.version;
  }

  opened(): void {
    this.attempt = 0;
    this.set('live', null);
  }

  event(event: WatchEvent): void {
    this.gone = 0;
    const object = event.object as unknown as T;
    const version = event.object.metadata?.resourceVersion;
    if (version) this.version = version;
    if (event.type === 'BOOKMARK') return;
    const key = objectKey(object);
    if (event.type === 'DELETED') {
      // One it never had: nothing changed.
      if (!this.data.delete(key)) return;
    } else {
      // The same version again (a watch opened again from before it): nothing changed.
      if (version && this.data.get(key)?.metadata?.resourceVersion === version) return;
      this.data.set(key, object);
    }
    this.publish();
  }

  retrying(error: { code: string; message: string }): void {
    this.set(this.listed ? 'stale' : 'loading', new ApiError(0, error.code, error.message));
  }

  waiting(): void {
    this.set(this.listed ? 'stale' : 'loading', new ApiError(0, 'waiting', 'waiting for room on a watch stream'));
  }

  ended(status: Status): void {
    if (!this.running) return;
    // Too far behind to go on from: list again (what there is stays until the list replaces it).
    if (status.code === 410) {
      this.set('stale', new ApiError(410, status.reason ?? 'Expired', status.message ?? 'the watch is too far behind', status));
      const wait = this.gone === 0 ? 0 : Math.min(this.retryMs * 2 ** (this.gone - 1), this.maxRetryMs);
      this.gone++;
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => void this.load(), wait);
      return;
    }
    this.running = false;
    this.set('error', new ApiError(status.code ?? 0, status.reason ?? 'watch_ended', status.message ?? 'the watch ended', status));
  }

  disconnected(error: ApiError): void {
    if (!this.running) return;
    // Signed out: an error, as a list refused so would be — nothing is asked again.
    if (error.code === 'unauthorized') {
      this.running = false;
      this.set('error', error);
      return;
    }
    this.set(this.listed ? 'stale' : this.stateSignal.peek(), error);
  }

  // ──

  private set(state: CollectionState, error: ApiError | null): void {
    batch(() => {
      this.stateSignal.value = state;
      this.errorSignal.value = error;
    });
  }

  private async load(): Promise<void> {
    if (!this.running) return;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    // Still this load's to go on: whoever read what it published may have stopped it (or closed the store).
    const going = () => !controller.signal.aborted && this.running && this.controller === controller;
    try {
      const list = await this.api.list<T>(this.path, {}, controller.signal);
      if (!going()) return;
      this.data = new Map(list.items.map((o) => [objectKey(o), withoutManagedFields(o)]));
      this.version = list.resourceVersion;
      this.listed = true;
      this.attempt = 0;
      // The list is all there is now; the watch, opening, keeps it so.
      batch(() => {
        this.itemsSignal.value = new Map(this.data);
        this.set('live', null);
      });
      if (!going()) return;
      // Watched from the list on; one that cannot be watched is listed again now and then.
      if (!this.kind.verbs.includes('watch')) this.retryTimer = setTimeout(() => void this.load(), this.pollMs);
      else if (!this.stream.has(this.id)) this.stream.add(this);
    } catch (err) {
      if (!going()) return;
      const error = err instanceof ApiError ? err : new ApiError(0, 'network', (err as Error).message);
      if (!error.passing) {
        this.running = false;
        this.set('error', error);
        return;
      }
      this.set(this.listed ? 'stale' : 'loading', error);
      if (!going()) return;
      const wait = Math.min(this.retryMs * 2 ** this.attempt++, this.maxRetryMs);
      this.retryTimer = setTimeout(() => void this.load(), wait);
    }
  }

  /** Publish the objects once the events at hand are in: one new map for a batch, not one per event. */
  private publish(): void {
    if (this.publishing) return;
    this.publishing = true;
    queueMicrotask(() => {
      this.publishing = false;
      this.itemsSignal.value = new Map(this.data);
    });
  }
}

/** Lists carry managedFields (the watch's events come without): not kept, they are most of an object. */
function withoutManagedFields<T extends KubeObject>(object: T): T {
  if (object.metadata?.managedFields) delete object.metadata.managedFields;
  return object;
}
