import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { keyOf } from '@overkube/query';
import { batch, type ReadonlySignal, type Signal, signal } from '@preact/signals';
import { ApiError, collectionPath, type Http, METADATA_LIST, pagesOf, type Status } from './http.ts';
import type { Subscriber, WatchEvent, WatchStream } from './stream.ts';

/*
 * A feed: one collection's objects kept current — a kind in every
 * namespace or in one, one object of it by name, by a label selector, whole
 * or only metadata. Listed in pages (the API server's limit and continue,
 * every page of one snapshot), the first list's objects there as each page
 * comes; then watched over the page's stream from the list's
 * resourceVersion. A watch gone too far behind (410) is listed again —
 * after a wait that grows while it keeps happening — what there is staying
 * until the new list is whole; while the stream is down, what there is
 * stays (stale) until the watch opens again.
 *
 * Its objects are one map, changed in place, and by namespace (those of
 * a few namespaces read without going through the rest); its revision
 * tells when they changed — a namespace's, when its did — once for the
 * events at hand, not once per event: whoever reads them reads the
 * revision first, and reads them as they are then.
 */

/**
 * - loading: not listed and watched yet (a first list's pages may be there already);
 * - live: listed, and kept current by its watch (open);
 * - stale: what is there may be behind (the stream is down, the watch is
 *   tried again, a list is retried, it waits for room on the stream);
 * - error: it cannot be had (403: not allowed, 404: not served, the
 *   session is over): `error` says why; retry() tries again.
 */
export type FeedState = 'loading' | 'live' | 'stale' | 'error';

/** What a feed is of. */
export interface FeedSpec {
  kind: KindInfo;
  /** One namespace; none: every one (or a kind of none). */
  namespace?: string;
  /** One object, by name. */
  name?: string;
  labelSelector?: string;
  /** Only the objects' metadata (PartialObjectMetadata). */
  projection?: 'metadata';
}

/** A feed's key: the same spec, the same key. */
export function feedKey(spec: FeedSpec): string {
  return JSON.stringify([spec.kind.id, spec.namespace ?? '', spec.name ?? '', spec.labelSelector ?? '', spec.projection ?? '']);
}

export interface FeedOptions {
  /** A list's page. */
  pageSize?: number;
  /** The first wait before a failed list (or a list again after 410s in a row) is tried; doubled up to maxRetryMs. */
  retryMs?: number;
  maxRetryMs?: number;
  /** How often a kind that cannot be watched (no watch verb: ComponentStatus) is listed again. */
  pollMs?: number;
}

/** How many times a list is begun again when its pages expire (410) on the way. */
const LIST_ATTEMPTS = 3;

export class Feed implements Subscriber {
  readonly spec: FeedSpec;
  readonly key: string;
  readonly path: string;
  readonly labelSelector?: string;
  readonly fieldSelector?: string;
  readonly projection?: 'metadata';
  private readonly revisionSignal = signal(0);
  private readonly stateSignal = signal<FeedState>('loading');
  private readonly errorSignal = signal<ApiError | null>(null);
  private readonly http: Http;
  private readonly stream: WatchStream;
  private readonly options: Required<FeedOptions>;
  private data = new Map<string, KubeObject>();
  private spaces = new Map<string, Map<string, KubeObject>>();
  private readonly spaceRevisions = new Map<string, Signal<number>>();
  /** The namespaces changed since the revision last moved (null: all of them). */
  private touched: Set<string> | null = new Set();
  private readonly wholeSignal = signal(false);
  private version = '';
  private running = false;
  private listed = false;
  private unsubscribe: (() => void) | null = null;
  /** Failed lists in a row. */
  private attempt = 0;
  /** 410s in a row, with no event between: each list again waits longer. */
  private gone = 0;
  private controller: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private publishing = false;
  /** A first list's pages coming after its first: not told till it is whole (its first page shown at once, the rest at the end). */
  private quiet = false;

  constructor(spec: FeedSpec, http: Http, stream: WatchStream, options: FeedOptions = {}) {
    this.spec = spec;
    this.key = feedKey(spec);
    this.path = collectionPath(spec.kind, spec.namespace);
    if (spec.labelSelector) this.labelSelector = spec.labelSelector;
    if (spec.name !== undefined) this.fieldSelector = `metadata.name=${spec.name}`;
    if (spec.projection) this.projection = spec.projection;
    this.http = http;
    this.stream = stream;
    this.options = { pageSize: 500, retryMs: 1000, maxRetryMs: 30_000, pollMs: 30_000, ...options };
  }

  /** The objects, by keyOf (namespace/name): one map, changed in place (read revision first). */
  get objects(): ReadonlyMap<string, KubeObject> {
    return this.data;
  }

  /** Changes whenever the objects do. */
  get revision(): ReadonlySignal<number> {
    return this.revisionSignal;
  }

  /** The objects of one namespace ("": of none), by keyOf (namespace/name): changed in place (read revisionIn first). */
  inNamespace(namespace: string): ReadonlyMap<string, KubeObject> {
    return this.spaces.get(namespace) ?? NONE;
  }

  /** Changes whenever the objects of this namespace do. */
  revisionIn(namespace: string): ReadonlySignal<number> {
    let s = this.spaceRevisions.get(namespace);
    if (!s) {
      const spaces = this.spaceRevisions;
      // Kept while read (or while it has objects): one read no more, of no objects, let go.
      s = signal(0, {
        unwatched: () => {
          if (!this.spaces.has(namespace)) spaces.delete(namespace);
        },
      });
      spaces.set(namespace, s);
    }
    return s;
  }

  /** Whether it has been listed whole (once at least: what there is may be behind, never cut short). */
  get whole(): ReadonlySignal<boolean> {
    return this.wholeSignal;
  }

  get state(): ReadonlySignal<FeedState> {
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
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** After an error: begin again (a list, then the watch). */
  retry(): void {
    if (this.running || this.stateSignal.peek() !== 'error') return;
    this.attempt = 0;
    this.gone = 0;
    this.start();
  }

  /** Stopped, what there was let go (memory). */
  forget(): void {
    this.stop();
    this.listed = false;
    this.wholeSignal.value = false;
    this.version = '';
    if (this.data.size) this.replace(new Map());
    this.set('loading', null);
  }

  // ── Subscriber ──

  resourceVersion(): string {
    return this.version;
  }

  opened(): void {
    this.attempt = 0;
    this.set('live', null);
  }

  event(event: WatchEvent): void {
    this.gone = 0;
    const object = event.object as unknown as KubeObject;
    const version = event.object.metadata?.resourceVersion;
    if (version) this.version = version;
    if (event.type === 'BOOKMARK') return;
    const key = keyOf(object);
    if (event.type === 'DELETED') {
      // One it never had: nothing changed.
      if (!this.remove(key)) return;
    } else {
      // The same version again (a watch put on again from before it): nothing changed.
      if (version && this.data.get(key)?.metadata?.resourceVersion === version) return;
      this.add(key, object);
    }
  }

  retrying(error: { code: string; message: string }): void {
    this.set(this.listed ? 'stale' : 'loading', new ApiError(0, error.code, error.message));
  }

  waiting(): void {
    this.set(this.listed ? 'stale' : 'loading', new ApiError(0, 'waiting', 'waiting for room on the stream'));
  }

  ended(status: Status): void {
    this.unsubscribe = null;
    if (!this.running) return;
    // Too far behind to go on from: list again (what there is stays until the list replaces it).
    if (status.code === 410) {
      this.set('stale', new ApiError(410, status.reason ?? 'Expired', status.message ?? 'the watch is too far behind', status));
      const wait = this.gone === 0 ? 0 : Math.min(this.options.retryMs * 2 ** (this.gone - 1), this.options.maxRetryMs);
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
      this.stop();
      this.set('error', error);
      return;
    }
    this.set(this.listed ? 'stale' : this.stateSignal.peek(), error);
  }

  // ──

  private set(state: FeedState, error: ApiError | null): void {
    batch(() => {
      this.stateSignal.value = state;
      this.errorSignal.value = error;
    });
  }

  private async load(): Promise<void> {
    if (!this.running) return;
    this.controller?.abort();
    this.unsubscribe?.();
    this.unsubscribe = null;
    const controller = new AbortController();
    this.controller = controller;
    // Still this load's to go on: whoever read what it published may have stopped it.
    const going = () => !controller.signal.aborted && this.running && this.controller === controller;
    try {
      if (!(await this.list(going, controller.signal))) return;
      const first = !this.listed;
      this.listed = true;
      this.wholeSignal.value = true;
      this.attempt = 0;
      // Watched from the list on: live once the watch is open (a first list: loading till then; a list again: stale). One that cannot be watched: live, listed again now and then.
      const watched = this.spec.kind.verbs.includes('watch');
      this.set(watched ? (first ? 'loading' : 'stale') : 'live', null);
      if (!going()) return;
      if (!watched) this.retryTimer = setTimeout(() => void this.load(), this.options.pollMs);
      else this.unsubscribe = this.stream.subscribe(this);
    } catch (err) {
      if (!going()) return;
      const error = err instanceof ApiError ? err : new ApiError(0, 'network', (err as Error).message);
      // Refused, or not served: stopped (retry() asks again); its snapshot expiring every time (a busy collection): tried again after a wait.
      if (!error.passing && error.status !== 410) {
        this.running = false;
        this.set('error', error);
        return;
      }
      this.set(this.listed ? 'stale' : 'loading', error);
      const wait = Math.min(this.options.retryMs * 2 ** this.attempt++, this.options.maxRetryMs);
      this.retryTimer = setTimeout(() => void this.load(), wait);
    }
  }

  /**
   * Every object, page by page, all of one snapshot; begun again when the
   * snapshot expires on the way (410 on a later page): pages of two
   * snapshots are never put together. The first list fills what there is
   * as it goes; a list again, what there is stays until it is whole.
   */
  private async list(going: () => boolean, signal: AbortSignal): Promise<boolean> {
    try {
      return await this.listing(going, signal);
    } finally {
      // Whole, given up or failed: what came of it told at once.
      if (this.quiet) {
        this.quiet = false;
        this.publish();
      }
    }
  }

  private async listing(going: () => boolean, signal: AbortSignal): Promise<boolean> {
    const fresh = !this.listed;
    const query = { labelSelector: this.labelSelector, fieldSelector: this.fieldSelector };
    const accept = this.projection === 'metadata' ? METADATA_LIST : undefined;
    for (let attempt = 1; ; attempt++) {
      // The first list fills what there is as it goes (it is empty); begun again, it fills a new map, what came so far shown till it is whole.
      const into = fresh && this.data.size === 0 ? this.data : new Map<string, KubeObject>();
      try {
        let version = '';
        for await (const page of pagesOf(this.http, this.path, query, { accept, signal, limit: () => this.options.pageSize ?? 500 })) {
          if (!going()) return false;
          for (const o of page.items) {
            if (into === this.data) this.add(keyOf(o), o);
            else into.set(keyOf(o), o);
          }
          // Its first page told; the rest, once it is whole (not each: whoever reads it reads it all again).
          if (into === this.data) this.quiet = true;
          version = page.resourceVersion;
        }
        // A list again (or a first one begun again): what there is, replaced at once.
        if (into !== this.data) this.replace(into);
        this.version = version;
        return true;
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 410) || attempt >= LIST_ATTEMPTS) throw err;
      }
    }
  }

  private add(key: string, object: KubeObject): void {
    this.data.set(key, object);
    const namespace = object.metadata?.namespace ?? '';
    let space = this.spaces.get(namespace);
    if (!space) {
      space = new Map();
      this.spaces.set(namespace, space);
    }
    space.set(key, object);
    this.touch(namespace);
  }

  private remove(key: string): boolean {
    const object = this.data.get(key);
    if (!object) return false;
    this.data.delete(key);
    const namespace = object.metadata?.namespace ?? '';
    const space = this.spaces.get(namespace);
    space?.delete(key);
    if (space?.size === 0) this.spaces.delete(namespace);
    this.touch(namespace);
    return true;
  }

  /** All of it at once (a list again, forgotten). */
  private replace(data: Map<string, KubeObject>): void {
    this.data = data;
    this.spaces = new Map();
    for (const [key, o] of data) {
      const namespace = o.metadata?.namespace ?? '';
      let space = this.spaces.get(namespace);
      if (!space) {
        space = new Map();
        this.spaces.set(namespace, space);
      }
      space.set(key, o);
    }
    this.touch(null);
  }

  /** A namespace's objects changed (null: any of them), told with the rest at hand. */
  private touch(namespace: string | null): void {
    if (namespace === null) this.touched = null;
    else this.touched?.add(namespace);
    this.publish();
  }

  /** The revisions moved once the events at hand are in: the feed's, those of the namespaces changed. */
  private publish(): void {
    if (this.publishing || this.quiet) return;
    this.publishing = true;
    nextFrame(() => {
      this.publishing = false;
      const touched = this.touched;
      this.touched = new Set();
      batch(() => {
        this.revisionSignal.value++;
        if (touched === null) for (const s of this.spaceRevisions.values()) s.value++;
        else
          for (const namespace of touched) {
            const s = this.spaceRevisions.get(namespace);
            if (s) s.value++;
          }
      });
    });
  }
}

const NONE: ReadonlyMap<string, KubeObject> = new Map();

/**
 * Once the frame being drawn is done (the page's next animation frame;
 * none — a server, a test: a frame's time): whoever reads the objects reads
 * them once a frame however many events came, not once an event.
 */
const nextFrame: (then: () => void) => void =
  typeof globalThis.requestAnimationFrame === 'function' ? (then) => void globalThis.requestAnimationFrame(() => then()) : (then) => void setTimeout(then, 16);
