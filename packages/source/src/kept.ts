import type { QueryError } from '@overkube/query';
import { type Signal, signal } from '@preact/signals';
import { passingBy, queryErrorOf } from './errors.ts';
import type { Lane, Queue } from './queue.ts';

/*
 * Answers asked once of the cluster and kept a while (a kind's count, a
 * kind's list for a search), by key: read as a signal in a computed — asked
 * once someone reads it there (a read no one follows asks nothing). While
 * someone does, it is asked again as it gets old (one that failed passing:
 * sooner, a while longer each time; refused: as any other); once no one
 * does, what is asked of it is let go (not asked, or aborted on its way),
 * and a while after it is let go of whole.
 */

/** What is had of a key: its value, or why there is none. */
export type Held<V> = { value: V } | { error: QueryError };

interface Entry<V> {
  value: Signal<Held<V> | undefined>;
  /** When it was last answered, read. */
  at: number;
  read: number;
  /** Its asking on its way (abort: let go of). */
  asking?: AbortController;
  /** Those reading it now, and when it is to be asked again for them. */
  readers: number;
  timer?: ReturnType<typeof setTimeout>;
  /** Failed in a row (passing): how long before it is asked again. */
  failed: number;
  ask: (signal: AbortSignal) => Promise<V>;
}

export interface KeptOptions {
  queue: Queue;
  lane: Lane;
  /** How long an answer is fresh. */
  ttl: number;
  /** How long one unread is kept (default: twice ttl). */
  idle?: number;
}

export class Kept<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly options: Required<KeptOptions>;

  constructor(options: KeptOptions) {
    this.options = { idle: options.ttl * 2, ...options };
  }

  /** A key's answer, as had (none yet: asked now, as ask says) — read in a computed, asked again as it gets old while it is read. */
  read(key: string, ask: (signal: AbortSignal) => Promise<V>): Held<V> | undefined {
    this.sweep();
    let entry = this.entries.get(key);
    if (!entry) {
      const made: Entry<V> = { at: 0, read: 0, readers: 0, failed: 0, ask, value: signal(undefined) };
      made.value = signal<Held<V> | undefined>(undefined, {
        watched: () => {
          made.readers++;
          this.plan(made);
        },
        unwatched: () => {
          if (--made.readers > 0) return;
          clearTimeout(made.timer);
          made.asking?.abort();
          made.asking = undefined;
          // Read by no one a while: let go of whole (read again before then: kept).
          made.timer = setTimeout(() => {
            made.timer = undefined;
            if (made.readers === 0 && this.entries.get(key) === made) this.entries.delete(key);
          }, this.options.idle);
        },
      });
      entry = made;
      this.entries.set(key, entry);
    }
    entry.ask = ask;
    entry.read = Date.now();
    if (entry.readers > 0 && !entry.asking && Date.now() - entry.at > this.options.ttl) this.start(entry);
    return entry.value.value;
  }

  /** How many are kept (for tests: what is let go of). */
  get size(): number {
    return this.entries.size;
  }

  private start(entry: Entry<V>): void {
    clearTimeout(entry.timer);
    entry.timer = undefined;
    const asking = new AbortController();
    entry.asking = asking;
    this.options.queue.add(
      async (signal) => {
        try {
          const value = await entry.ask(signal);
          if (signal.aborted) return;
          entry.value.value = { value };
          entry.failed = 0;
        } catch (e) {
          if (signal.aborted) return;
          const error = queryErrorOf(e);
          entry.value.value = { error };
          entry.failed = passingBy(error) ? entry.failed + 1 : 0;
        } finally {
          if (entry.asking === asking) {
            entry.asking = undefined;
            entry.at = signal.aborted ? entry.at : Date.now();
          }
          this.plan(entry);
        }
      },
      { lane: this.options.lane, signal: asking.signal },
    );
  }

  /** While read: asked as it gets old (never asked: at once; failed passing: after 2 s, 4 s… up to its ttl). */
  private plan(entry: Entry<V>): void {
    if (entry.readers === 0 || entry.asking) return;
    // Read again before it was let go of: kept (its letting go undone).
    clearTimeout(entry.timer);
    entry.timer = undefined;
    const fresh = entry.at + this.options.ttl - Date.now();
    const wait = entry.failed ? Math.min(2000 * 2 ** (entry.failed - 1), this.options.ttl) : Math.max(0, fresh);
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      if (entry.readers > 0) this.start(entry);
    }, wait);
  }

  /** Those unread a while, no one reading them: let go of. */
  private sweep(): void {
    const now = Date.now();
    for (const [key, e] of this.entries)
      if (e.readers === 0 && now - e.read > this.options.idle) {
        e.asking?.abort();
        clearTimeout(e.timer);
        this.entries.delete(key);
      }
  }
}
