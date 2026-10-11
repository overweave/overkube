import { kinds } from '@overkube/kube-types';
import { effect, type ReadonlySignal } from '@preact/signals';
import { Api, type ApiOptions, type Session } from './api.ts';
import { Discovery } from './discovery.ts';
import { Store, type StoreOptions } from './store.ts';
import { type StreamOptions, WatchStream } from './stream.ts';

/*
 * The page's client: the gateway (api), the watch streams, what the
 * cluster serves (discovery) and its objects (store). Discovery is asked
 * again when the cluster's APIs change — a CRD or an APIService comes, goes
 * or changes (an addon installed or removed, metrics-server down) — which
 * the store watches like any other kinds; and once more when those are
 * first in, for what changed between the first discovery and their lists.
 */

export interface ClientOptions {
  api?: ApiOptions;
  stream?: StreamOptions;
  store?: StoreOptions;
  /** How long after the APIs changed discovery is asked again (they change in bursts: an addon's CRDs). */
  rediscoverMs?: number;
  discovery?: { retryMs?: number };
}

export interface Client {
  readonly api: Api;
  readonly stream: WatchStream;
  readonly discovery: Discovery;
  readonly store: Store;
  /** expired once the host turns the page away: the user signs in again and reloads it. */
  readonly session: ReadonlySignal<Session>;
  /** Aborted once it is closed: what works over it (counts) stops then. */
  readonly signal: AbortSignal;
  /** Stop everything: the streams, the timers, the kinds. */
  close(): void;
}

export function createClient(options: ClientOptions = {}): Client {
  const api = new Api(options.api);
  const stream = new WatchStream(api, options.stream);
  const discovery = new Discovery(api, options.discovery);
  const closing = new AbortController();
  const store = new Store(api, stream, discovery, options.store);

  // What tells that the APIs changed; held for the page's life.
  const apis = [store.use(kinds.apiextensions.v1.CustomResourceDefinition), store.use(kinds.apiregistration.v1.APIService)];
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** What each was when last seen: its objects' names and versions (a list again that changed nothing is no change). */
  const seen = new Map<string, string>();
  const stop = effect(() => {
    let changed = false;
    for (const c of apis) {
      const state = c.state.value;
      if (state === 'loading' || state === 'absent' || state === 'error') continue;
      const now = [...c.items.value.values()]
        .map((o) => `${o.metadata?.name}@${o.metadata?.resourceVersion}`)
        .sort()
        .join(',');
      // The first time in counts too: it may hold what came after the first discovery.
      if (seen.get(c.kind.id) !== now) changed = true;
      seen.set(c.kind.id, now);
    }
    if (!changed) return;
    clearTimeout(timer);
    timer = setTimeout(() => void discovery.load(), options.rediscoverMs ?? 1000);
  });
  void discovery.load();

  return {
    api,
    stream,
    discovery,
    store,
    session: api.session,
    signal: closing.signal,
    close() {
      closing.abort();
      stop();
      clearTimeout(timer);
      for (const c of apis) c.release();
      store.close();
      stream.close();
      discovery.close();
    },
  };
}
