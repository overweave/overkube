import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { effect, type ReadonlySignal } from '@preact/signals';
import type { Api, ApiError } from './api.ts';
import type { Discovery } from './discovery.ts';
import { Informer, type InformerOptions } from './informer.ts';
import type { WatchStream } from './stream.ts';
import type { CollectionState, ObjectOfKind } from './types.ts';

/*
 * The cluster's objects as the page uses them: one informer per kind,
 * shared by all who use it, kept while anyone does and for a while after
 * (so that going from tab to tab does not list again), then let go — at
 * once when the streams need the room. Let go, it stops and forgets its
 * objects, but stays the kind's: its signals are the same ones whoever
 * took them before sees, and it starts again when taken again. A kind the
 * cluster does not serve (discovery) is not listed: it is absent, and
 * starts by itself once it is served (an addon installed).
 */

/** One kind's objects as they are seen: its signals. */
export interface CollectionView<T extends KubeObject = KubeObject> {
  readonly kind: KindInfo;
  /** By objectKey (namespace/name). */
  readonly items: ReadonlySignal<ReadonlyMap<string, T>>;
  readonly state: ReadonlySignal<CollectionState>;
  readonly error: ReadonlySignal<ApiError | null>;
  /** After an error (403, a refused watch): try again. */
  retry(): void;
}

/** One kind's objects, held until released. */
export interface Collection<T extends KubeObject = KubeObject> extends CollectionView<T> {
  /** Done with it: the kind is let go once nobody holds it for lingerMs. Once only. */
  release(): void;
}

export interface StoreOptions extends InformerOptions {
  /** How long a kind nobody holds is kept. */
  lingerMs?: number;
}

interface Entry {
  informer: Informer;
  refs: number;
  linger?: ReturnType<typeof setTimeout>;
  /** Follows discovery: starts or stops the informer as the kind is served or not. */
  dispose: () => void;
  /** Let go: stopped, its objects forgotten, until taken again. */
  dormant: boolean;
}

export class Store {
  private readonly api: Api;
  private readonly stream: WatchStream;
  private readonly discovery: Discovery | null;
  private readonly options: StoreOptions;
  private readonly entries = new Map<string, Entry>();
  private closed = false;

  constructor(api: Api, stream: WatchStream, discovery: Discovery | null, options: StoreOptions = {}) {
    this.api = api;
    this.stream = stream;
    this.discovery = discovery;
    this.options = options;
    // No stream has room: the kinds nobody holds go first — but the one asking for room (just listed, about to be watched).
    stream.needRoom = (asking) => {
      for (const [id, entry] of this.entries) if (id !== asking && entry.refs === 0 && !entry.dormant) this.drop(entry);
    };
  }

  /** Hold a kind's objects, typed by the kinds table: use(kinds.apps.v1.Deployment).items → Deployment. */
  use<K extends KindInfo>(kind: K): Collection<ObjectOfKind<K>> {
    this.live();
    const entry = this.entry(kind);
    entry.refs++;
    clearTimeout(entry.linger);
    entry.linger = undefined;
    let released = false;
    // The view itself, given release (not spread: its kind is read as discovery says it now).
    return Object.assign(this.view(entry), {
      release: () => {
        if (released) return;
        released = true;
        this.release(kind.id);
      },
    }) as Collection<ObjectOfKind<K>>;
  }

  /**
   * A kind's signals without holding it (useCollection holds it from its
   * effect): taken, it starts; held by nobody, it lingers — each peek
   * lingering it anew — and goes.
   */
  peek<K extends KindInfo>(kind: K): CollectionView<ObjectOfKind<K>> {
    this.live();
    const entry = this.entry(kind);
    if (entry.refs === 0) this.linger(entry);
    return this.view(entry) as CollectionView<ObjectOfKind<K>>;
  }

  /** The kinds held or lingering: what the page is watching. */
  get kinds(): string[] {
    return [...this.entries].filter(([, e]) => !e.dormant).map(([id]) => id);
  }

  /** Let every kind go at once; nothing is taken after. */
  close(): void {
    this.closed = true;
    for (const entry of this.entries.values()) this.drop(entry);
    this.entries.clear();
    this.stream.needRoom = null;
  }

  private live(): void {
    if (this.closed) throw new Error('the store is closed');
  }

  private view(entry: Entry): CollectionView {
    const { informer } = entry;
    return {
      // As discovery says it now.
      get kind() {
        return informer.kind;
      },
      items: informer.items,
      state: informer.state,
      error: informer.error,
      retry: () => informer.retry(),
    };
  }

  private entry(kind: KindInfo): Entry {
    const existing = this.entries.get(kind.id);
    if (existing && !existing.dormant) return existing;
    const entry: Entry = existing ?? { informer: new Informer(kind, this.api, this.stream, this.options), refs: 0, dispose: () => {}, dormant: false };
    entry.dormant = false;
    this.entries.set(kind.id, entry);
    this.follow(entry);
    return entry;
  }

  /** Run the informer as discovery says the kind is served. */
  private follow(entry: Entry): void {
    const { informer } = entry;
    const discovery = this.discovery;
    if (!discovery) {
      informer.start();
      return;
    }
    entry.dispose = effect(() => {
      const kinds = discovery.kinds.value;
      // Not known yet: wait, unless discovery itself failed (then try the kind anyway).
      if (!kinds) {
        if (discovery.state.value === 'error') informer.start();
        return;
      }
      const served = kinds.get(informer.id);
      if (!served) return informer.absent();
      informer.rekind(served);
      // One stopped on an error (403) stays so until retry(): discovery changing (a CRD burst) does not list it again.
      if (!informer.failed) informer.start();
    });
  }

  private release(id: string): void {
    const entry = this.entries.get(id);
    if (!entry || --entry.refs > 0) return;
    this.linger(entry);
  }

  private linger(entry: Entry): void {
    clearTimeout(entry.linger);
    entry.linger = setTimeout(() => this.drop(entry), this.options.lingerMs ?? 30_000);
  }

  private drop(entry: Entry): void {
    if (entry.dormant) return;
    clearTimeout(entry.linger);
    entry.linger = undefined;
    entry.dormant = true;
    entry.dispose();
    entry.dispose = () => {};
    entry.informer.forget();
  }
}
