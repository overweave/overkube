import { type KindInfo, kinds } from '@overkube/kube-types';
import { effect, type ReadonlySignal } from '@preact/signals';
import { Discovery } from './discovery.ts';
import { Feeds, type FeedsOptions } from './feeds.ts';
import { ApiError, Http, type HttpOptions, type Session } from './http.ts';
import { type Counted, countOnce, type Listed, type ListOnce, listOnce } from './lists.ts';
import { followLog, type LogFrom, type LogHandlers, type LogTarget, type LogWindow, readLog } from './logs.ts';
import { type StreamOptions, WatchStream } from './stream.ts';

/*
 * The page's connector: the gateway over HTTP (http), its one changing
 * stream (stream), what the cluster serves (discovery) and the feeds over
 * them. Discovery is asked again when the cluster's APIs change — a CRD or
 * an APIService comes, goes or changes (an addon installed or removed,
 * metrics-server down) — which it follows as feeds of their metadata; and
 * once more when those are first in, for what changed between the first
 * discovery and their lists. A container's log: followed over the same
 * stream, or read a window at a time.
 */

export interface ConnectorOptions {
  http?: HttpOptions;
  stream?: StreamOptions;
  feeds?: FeedsOptions;
  /** How long after the APIs changed discovery is asked again (they change in bursts: an addon's CRDs). */
  rediscoverMs?: number;
  discovery?: { retryMs?: number };
}

export interface Connector {
  readonly http: Http;
  readonly stream: WatchStream;
  readonly discovery: Discovery;
  readonly feeds: Feeds;
  /** A kind's objects listed once: no watch, nothing kept (a search over every kind). */
  list(kind: Pick<KindInfo, 'group' | 'version' | 'plural' | 'namespaced'>, options?: ListOnce): Promise<Listed>;
  /** How many of a kind there are (of a namespace), asked once as cheaply as can be: a page of one and how many past it. */
  count(kind: Pick<KindInfo, 'group' | 'version' | 'plural' | 'namespaced'>, options?: Pick<ListOnce, 'namespace' | 'signal'>): Promise<Counted>;
  /** A container's log followed: its last lines (or from a time), then each as it is written; let go of by the function given back. */
  followLog(target: LogTarget, from: LogFrom, told: LogHandlers): () => void;
  /** A window of a container's log, read once: from a time (or its last lines), at most so many bytes. */
  readLog(target: LogTarget, window: LogFrom & { limitBytes?: number }, signal?: AbortSignal): Promise<LogWindow>;
  /** expired once the host turns the page away: the user signs in again and reloads it. */
  readonly session: ReadonlySignal<Session>;
  /** Stop everything: the stream, the timers, the feeds. */
  close(): void;
}

export function createConnector(options: ConnectorOptions = {}): Connector {
  const http = new Http(options.http);
  const stream = new WatchStream(http, options.stream);
  const discovery = new Discovery(http, options.discovery);
  const feeds = new Feeds(http, stream, options.feeds);

  // What tells that the APIs changed; held for the page's life.
  const apis = [kinds.apiextensions.v1.CustomResourceDefinition, kinds.apiregistration.v1.APIService].map((kind) => feeds.use({ kind, projection: 'metadata' }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** What each was when last seen: its objects' names and versions (a list again that changed nothing is no change). */
  const seen = new Map<string, string>();
  const stop = effect(() => {
    let changed = false;
    for (const { feed } of apis) {
      feed.revision.value;
      const state = feed.state.value;
      if (state === 'loading' || state === 'error') continue;
      const now = [...feed.objects.values()]
        .map((o) => `${o.metadata?.name}@${o.metadata?.resourceVersion}`)
        .sort()
        .join(',');
      // The first time in counts too: it may hold what came after the first discovery.
      if (seen.get(feed.key) !== now) changed = true;
      seen.set(feed.key, now);
    }
    if (!changed) return;
    clearTimeout(timer);
    timer = setTimeout(() => void discovery.load(), options.rediscoverMs ?? 1000);
  });
  void discovery.load();
  // Closed: nothing more asked once (a list, a count); a window on its way, given up.
  let closed = false;
  const reading = new Set<AbortController>();
  const gone = () => new ApiError(0, 'closed', 'the connector is closed');

  return {
    http,
    stream,
    discovery,
    feeds,
    list: (kind, how) => (closed ? Promise.reject(gone()) : listOnce(http, kind, how)),
    count: (kind, how) => (closed ? Promise.reject(gone()) : countOnce(http, kind, how)),
    followLog: (target, from, told) => {
      if (!closed) return followLog(stream, target, from, told);
      told.ended(gone());
      return () => {};
    },
    readLog: (target, window, signal) => {
      if (closed) return Promise.reject(gone());
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      reading.add(controller);
      return readLog(http, target, window, controller.signal).finally(() => {
        reading.delete(controller);
        signal?.removeEventListener('abort', abort);
      });
    },
    session: http.session,
    close() {
      closed = true;
      for (const r of reading) r.abort(gone());
      stop();
      clearTimeout(timer);
      for (const a of apis) a.release();
      feeds.close();
      stream.close();
      discovery.close();
    },
  };
}
