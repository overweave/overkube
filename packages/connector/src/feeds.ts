import { type Signal, signal } from '@preact/signals';
import { Feed, type FeedOptions, type FeedSpec, feedKey } from './feed.ts';
import type { Http } from './http.ts';
import type { WatchStream } from './stream.ts';

/*
 * The page's feeds: one per spec, shared by all who use it, kept while
 * anyone does and for a while after (going from tab to tab does not list
 * again), then let go — at once when the stream needs the room (a feed
 * wants on it, or waits). What there is and who holds it is read as a
 * signal (find, holders): a query reads a feed others hold (one of the
 * whole cluster, for some namespaces of it) while they do.
 */

export interface FeedsOptions extends FeedOptions {
  /** How long a feed nobody holds is kept. */
  lingerMs?: number;
}

/** A feed held until released. */
export interface FeedHold {
  readonly feed: Feed;
  /** Done with it: the feed is let go once nobody holds it for lingerMs. Once only. */
  release(): void;
}

interface Entry {
  feed: Feed;
  /** Who hold it (holders()), and who keep it only for a while (weak: not told as holding it). */
  refs: number;
  weak: number;
  linger?: ReturnType<typeof setTimeout>;
}

export class Feeds {
  private readonly http: Http;
  private readonly stream: WatchStream;
  private readonly options: FeedsOptions;
  private readonly entries = new Map<string, Entry>();
  /** By key: moves whenever its feed comes or goes, or is held by someone or by no one any more (a planner reads the keys it asks of only). */
  private readonly changes = new Map<string, Signal<number>>();
  private closed = false;

  constructor(http: Http, stream: WatchStream, options: FeedsOptions = {}) {
    this.http = http;
    this.stream = stream;
    this.options = options;
    // No room on the stream: the feeds nobody holds go first.
    stream.needRoom = () => {
      for (const entry of [...this.entries.values()]) if (entry.refs + entry.weak === 0) this.drop(entry);
    };
  }

  /**
   * Hold a feed: the one of this spec, or a new one, started; one that ended
   * in an error while nobody held it, tried again (a kind back, a role
   * granted). Weak: kept, not told as held (a query keeping what it shows
   * while its next feeds come in). Closed: a feed never started.
   */
  use(spec: FeedSpec, how: { weak?: boolean } = {}): FeedHold {
    if (this.closed) return { feed: new Feed(spec, this.http, this.stream, this.options), release: () => {} };
    const key = feedKey(spec);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { feed: new Feed(spec, this.http, this.stream, this.options), refs: 0, weak: 0 };
      this.entries.set(key, entry);
      entry.feed.start();
    } else if (entry.refs + entry.weak === 0) entry.feed.retry();
    const held = entry;
    clearTimeout(held.linger);
    held.linger = undefined;
    const weak = how.weak === true;
    if (weak) held.weak++;
    else if (held.refs++ === 0) this.changed(key);
    let released = false;
    return {
      feed: held.feed,
      release: () => {
        if (released) return;
        released = true;
        if (weak) held.weak--;
        else if (--held.refs === 0 && this.entries.get(key) === held) this.changed(key);
        // After those told (they may have taken it again).
        this.idle(held);
      },
    };
  }

  /** The feed of this spec, if there is one (held or lingering): not held by asking. */
  find(spec: FeedSpec): Feed | undefined {
    const key = feedKey(spec);
    this.change(key).value;
    return this.entries.get(key)?.feed;
  }

  /** How many hold the feed of this spec (none, or no such feed: 0). */
  holders(spec: FeedSpec): number {
    const key = feedKey(spec);
    this.change(key).value;
    return this.entries.get(key)?.refs ?? 0;
  }

  /** The feeds held or lingering, by key. */
  get keys(): string[] {
    return [...this.entries.keys()];
  }

  /** Let every feed go at once; nothing is taken after (use: a feed never started). */
  close(): void {
    this.closed = true;
    this.stream.needRoom = null;
    for (const entry of [...this.entries.values()]) this.drop(entry);
  }

  /** Held by no one: let go after lingerMs — soon (not at once: those told may take it again) when others wait for room on the stream. */
  private idle(entry: Entry): void {
    if (entry.refs + entry.weak > 0 || this.entries.get(entry.feed.key) !== entry) return;
    clearTimeout(entry.linger);
    entry.linger = setTimeout(() => this.drop(entry), this.stream.queued ? 0 : (this.options.lingerMs ?? 30_000));
  }

  private change(key: string): Signal<number> {
    let s = this.changes.get(key);
    if (!s) {
      s = signal(0);
      this.changes.set(key, s);
    }
    return s;
  }

  private changed(key: string): void {
    this.change(key).value++;
  }

  private drop(entry: Entry): void {
    clearTimeout(entry.linger);
    // Gone already (another of its key in its place), or held again: not this one to let go.
    if (this.entries.get(entry.feed.key) !== entry || (!this.closed && entry.refs + entry.weak > 0)) return;
    this.entries.delete(entry.feed.key);
    entry.feed.forget();
    this.changed(entry.feed.key);
  }
}
