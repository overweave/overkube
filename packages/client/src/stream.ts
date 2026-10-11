import { WATCH } from '@overkube/gateway/protocol';
import { type Api, ApiError, type Status, type WatchSpec } from './api.ts';

/*
 * The page's watches over as few /watch streams as they fit in: one while
 * there are at most maxWatches (the gateway's limit per stream), another
 * beyond that, up to maxStreams (a browser keeps few connections per site,
 * and the host page may use some). Past that, a watch waits for room —
 * kinds nobody uses any more are let go first (needRoom) — and gets on as
 * soon as some is free.
 *
 * Each stream is opened again — every watch from the last resourceVersion its
 * owner saw — when its watches change (a moment later: a page asking for
 * several at once opens one stream), when the gateway lets it go (CLOSE),
 * when it breaks, does not open in time or goes quiet (no PING), then after
 * a wait that grows while it keeps failing and is begun again only once a
 * stream has held (a PING, or stableMs).
 *
 * Every watch put on is a subscription of its own, under its own id on the
 * stream — its kind's, or, one the gateway would not take (too long), a
 * short one of its own (_1, _2): a line of a stream opened for an earlier one
 * (the same kind, taken off and put on again) never reaches the later one.
 *
 * A failed stream is not opened again before its wait is over, whatever
 * watches come and go meanwhile. One watch the gateway ends (410, 403) goes
 * off the stream without the others being opened again; one it refuses
 * (bad_watch) ends alone, the others go on. A refusal that will never pass
 * (the session over, another site's page, a gateway that takes no such
 * request) ends them all, and is not tried again.
 */

/** A watch event as the gateway passes it on. */
export interface WatchEvent {
  type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK';
  object: { metadata?: { name?: string; namespace?: string; resourceVersion?: string } } & Record<string, unknown>;
}

/** Who owns a watch: where it is, where it goes on from, and what it is told. */
export interface Watcher {
  readonly id: string;
  /** The collection, with its selectors: /api/v1/pods?labelSelector=… */
  readonly path: string;
  /** The last resourceVersion it saw: the watch goes on from there whenever it is opened again. */
  resourceVersion(): string;
  /** The watch is open: events follow. */
  opened(): void;
  event(event: WatchEvent): void;
  /** The gateway lost the watch for now and tries again by itself. */
  retrying(error: { code: string; message: string }): void;
  /** The watch is over (410 Gone, 403, 404, refused): it is off the stream; its owner decides what next. */
  ended(status: Status): void;
  /** Its stream broke: what the owner has may be behind until the watch opens again. */
  disconnected(error: ApiError): void;
  /** No stream has room for it yet: it gets on when one has. */
  waiting(): void;
}

export interface StreamOptions {
  /** How long to wait for more watches before (re)opening a stream. */
  debounceMs?: number;
  /** The first wait after a stream failed; doubled each time up to maxRetryMs, ± jitter. */
  retryMs?: number;
  maxRetryMs?: number;
  jitter?: number;
  /** A stream whose answer has not begun in this long is given up. */
  openTimeoutMs?: number;
  /** A stream with no line (the gateway PINGs every 20 s) for this long is taken as broken. */
  quietMs?: number;
  /** A stream that held this long (or PINGed) has worked: the next failure waits the shortest again. */
  stableMs?: number;
  /** As many watches as the gateway takes on one stream. */
  maxWatches?: number;
  /** As many streams as the page opens. */
  maxStreams?: number;
  /** How long to wait for more watches before opening again a stream that is working (a moment more than debounceMs: watches come back in bursts). */
  addMs?: number;
  /** The longest line taken from a stream (one event). */
  maxLineBytes?: number;
  random?: () => number;
  /** Told each wait before a stream is opened again (for tests and logs). */
  onRetry?: (waitMs: number) => void;
}

const DEFAULTS = {
  debounceMs: 20,
  retryMs: 1000,
  maxRetryMs: 30_000,
  jitter: 0.2,
  openTimeoutMs: 15_000,
  quietMs: 50_000,
  stableMs: 30_000,
  maxWatches: WATCH.watchesPerStream as number,
  maxStreams: 2,
  addMs: 250,
  maxLineBytes: 16 * 1024 * 1024,
  random: Math.random,
};

type Settings = typeof DEFAULTS & Pick<StreamOptions, 'onRetry'>;

type Line =
  | { type: 'PING' }
  | { type: 'CLOSE'; reason?: string }
  | { w: string; type: 'OPEN' }
  | { w: string; type: 'RETRY'; error: { code: string; message: string } }
  | { w: string; type: 'ERROR'; object: Status }
  | ({ w: string } & WatchEvent);

/** A watch put on the streams: its owner, its id on the stream, and the stream it is on (none while it waits). */
interface Sub {
  readonly watcher: Watcher;
  readonly wire: string;
  conn: Connection | null;
}

/** The gateway's own refusals that will never pass, asked again: what they end is not tried again. */
const FOR_GOOD = new Set(['cross_site', 'read_only', 'bad_method', 'bad_path', 'too_large', 'bad_body']);

/** Line types a stream may carry; anything else is not the gateway's, and is left alone. */
const EVENTS = new Set(['ADDED', 'MODIFIED', 'DELETED', 'BOOKMARK']);

/** An id as the gateway takes it on a stream, or none (too long, or what it does not take). */
const wireId = (id: string) => (!id.startsWith('_') && WATCH.spec.test(`${id}::/`) ? id : undefined);

/** A resourceVersion as the gateway takes it (opaque, no ":" or space); another: from now. */
const sendable = (rv: string) => (/^[^:\s]*$/.test(rv) ? rv : '');

export class WatchStream {
  /** Let go of what is not needed (kinds nobody uses — but the one asking for room) when no stream has room. The store sets it. */
  needRoom: ((asking: string) => void) | null = null;
  readonly api: Api;
  readonly settings: Settings;
  private readonly subs = new Map<string, Sub>();
  private pending: Sub[] = [];
  private readonly conns: Connection[] = [];
  private closed = false;
  private wires = 0;

  constructor(api: Api, options: StreamOptions = {}) {
    this.api = api;
    this.settings = { ...DEFAULTS, ...options };
  }

  /** Watch (on a stream opened again with it a moment later, or as soon as one has room). */
  add(watcher: Watcher): void {
    if (this.closed) return;
    if (this.subs.has(watcher.id)) throw new Error(`a watch ${watcher.id} is on the streams already`);
    const sub: Sub = { watcher, wire: wireId(watcher.id) ?? `_${++this.wires}`, conn: null };
    this.subs.set(watcher.id, sub);
    if (this.place(sub)) return;
    this.needRoom?.(watcher.id);
    if (!this.current(sub) || this.place(sub)) return;
    this.pending.push(sub);
    watcher.waiting();
  }

  /** Stop a watch (its stream is opened again without it a moment later, or closed). */
  remove(id: string): void {
    const sub = this.subs.get(id);
    if (sub) this.forget(sub);
  }

  has(id: string): boolean {
    return this.subs.has(id);
  }

  /** How many streams are open or opening. */
  get streams(): number {
    return this.conns.length;
  }

  /** Stop everything: the streams, their timers, their watches (not told). */
  close(): void {
    this.closed = true;
    this.subs.clear();
    this.pending = [];
    for (const c of this.conns.splice(0)) c.close();
  }

  /** Whether a subscription is still the one its owner has on. */
  current(sub: Sub): boolean {
    return this.subs.get(sub.watcher.id) === sub;
  }

  /**
   * Take a subscription off (its owner removed it, or its stream ended it),
   * and let a waiting one on. Ended by the gateway (quiet), the stream goes on
   * as it is: the gateway stopped that watch, the others' lines keep coming.
   */
  forget(sub: Sub, quiet = false): void {
    if (this.current(sub)) this.subs.delete(sub.watcher.id);
    this.pending = this.pending.filter((s) => s !== sub);
    const conn = sub.conn;
    sub.conn = null;
    conn?.take(sub, quiet);
    this.drain();
  }

  /** A stream with nothing left on it goes. */
  retire(conn: Connection): void {
    const i = this.conns.indexOf(conn);
    if (i >= 0) this.conns.splice(i, 1);
    conn.close();
    this.drain();
  }

  private place(sub: Sub): boolean {
    const { maxWatches, maxStreams, debounceMs } = this.settings;
    let conn = this.conns.find((c) => c.size < maxWatches);
    if (!conn && this.conns.length < maxStreams) {
      conn = new Connection(this);
      this.conns.push(conn);
    }
    if (!conn) return false;
    sub.conn = conn;
    conn.put(sub, debounceMs);
    return true;
  }

  private drain(): void {
    while (this.pending.length && !this.closed) {
      const next = this.pending[0];
      if (!this.place(next)) return;
      this.pending.shift();
    }
  }
}

/** One /watch stream and the watches on it. */
class Connection {
  private readonly owner: WatchStream;
  /** What it should carry. */
  private readonly subs = new Map<string, Sub>();
  /** What the request open now carries: lines are for these. */
  private live = new Map<string, Sub>();
  /** Each opening; lines and failures of one given up on count for nothing. */
  private generation = 0;
  private controller: AbortController | null = null;
  private attempt = 0;
  private openedAt = 0;
  /** Not opened again before this (a failed stream's wait), whatever comes and goes meanwhile. */
  private notBefore = 0;
  private openTimer: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private quietTimer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;

  constructor(owner: WatchStream) {
    this.owner = owner;
  }

  get size(): number {
    return this.subs.size;
  }

  put(sub: Sub, delay: number): void {
    this.subs.set(sub.watcher.id, sub);
    // A working stream waits a moment more for others to come (a relist puts its watch back).
    this.schedule(this.openedAt ? Math.max(delay, this.owner.settings.addMs) : delay);
  }

  /** A watch taken off: opened again without it (unless the gateway ended it: quiet), or gone when it was the last. */
  take(sub: Sub, quiet = false): void {
    if (this.subs.get(sub.watcher.id) === sub) this.subs.delete(sub.watcher.id);
    this.live.delete(sub.wire);
    if (this.subs.size === 0) this.owner.retire(this);
    else if (!quiet) this.schedule(this.owner.settings.debounceMs);
  }

  close(): void {
    this.closed = true;
    this.drop();
    clearTimeout(this.openTimer);
  }

  private schedule(delay: number): void {
    if (this.closed) return;
    clearTimeout(this.openTimer);
    this.openTimer = setTimeout(() => this.open(), Math.max(delay, this.notBefore - Date.now()));
  }

  /** Give up on the request there is: its lines no longer count. */
  private drop(): void {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    clearTimeout(this.deadline);
    clearTimeout(this.quietTimer);
  }

  private open(): void {
    this.drop();
    if (this.closed || this.subs.size === 0) return;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.live = new Map([...this.subs.values()].map((s) => [s.wire, s]));
    this.openedAt = 0;
    const specs: WatchSpec[] = [...this.live.values()].map(({ wire, watcher: w }) => ({ id: wire, resourceVersion: sendable(w.resourceVersion()), path: w.path }));
    const { openTimeoutMs } = this.owner.settings;
    this.deadline = setTimeout(() => this.lost(generation, new ApiError(0, 'network', `the stream did not open in ${openTimeoutMs} ms`)), openTimeoutMs);
    void this.run(generation, controller.signal, specs);
  }

  private async run(generation: number, signal: AbortSignal, specs: WatchSpec[]): Promise<void> {
    const current = () => generation === this.generation;
    try {
      const res = await this.owner.api.watch(specs, signal);
      if (!current()) return;
      clearTimeout(this.deadline);
      this.openedAt = Date.now();
      this.heard(generation);
      const reader = res.body?.getReader();
      if (!reader) throw new ApiError(0, 'network', 'the stream has no body');
      const decoder = new TextDecoder();
      let rest = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (!current()) return;
        if (done) break;
        this.heard(generation);
        const lines = (rest + decoder.decode(value, { stream: true })).split('\n');
        rest = lines.pop() ?? '';
        const { maxLineBytes } = this.owner.settings;
        if (rest.length > maxLineBytes || lines.some((l) => l.length > maxLineBytes)) throw new ApiError(0, 'network', `the stream sent a line longer than ${maxLineBytes}`);
        for (const text of lines) {
          if (!text.trim()) continue;
          this.line(JSON.parse(text) as Line, generation);
          if (!current()) return;
        }
      }
      this.lost(generation, new ApiError(0, 'network', 'the stream ended'));
    } catch (err) {
      if (!current()) return;
      const error = err instanceof ApiError ? err : new ApiError(0, 'network', (err as Error).message);
      // The session is over: nothing is asked again (api.session says so, once).
      if (error.code === 'unauthorized') this.halt(error);
      // A watch the gateway does not take: that one ends (or, none named, those of this stream), and is not tried again.
      else if (error.code === 'bad_watch') this.refused(error, error.watch);
      // A refusal of the gateway's that will never pass: they end with why.
      else if (!error.passing && FOR_GOOD.has(error.code)) this.refused(error);
      // Anything else (the host restarting, a proxy's answer, the gateway busy, the cluster away): again, after a wait.
      else this.lost(generation, error);
    }
  }

  private line(line: Line, generation: number): void {
    if (!('w' in line)) {
      // A PING: the stream holds; the next failure waits the shortest again.
      if (line.type === 'PING') this.attempt = 0;
      // The gateway let the stream go: open it again — a gateway stopping is no failure of the stream's (its wait does not grow).
      else if (line.type === 'CLOSE')
        this.lost(generation, new ApiError(0, 'closed', `the gateway closed the stream: ${line.reason ?? 'no reason given'}`), line.reason === 'shutdown');
      return;
    }
    const sub = this.live.get(line.w);
    if (!sub || !this.owner.current(sub)) return;
    switch (line.type) {
      case 'OPEN':
        sub.watcher.opened();
        return;
      case 'RETRY':
        sub.watcher.retrying(line.error);
        return;
      case 'ERROR':
        // The gateway stopped it; the stream goes on as it is without it (not opened again), or goes when it was the last.
        this.owner.forget(sub, true);
        sub.watcher.ended(line.object);
        return;
      default:
        // An event, or nothing of the gateway's (left alone).
        if (EVENTS.has(line.type) && line.object && typeof line.object === 'object') sub.watcher.event(line);
    }
  }

  /** Heard from the stream: it is alive for another quietMs. */
  private heard(generation: number): void {
    clearTimeout(this.quietTimer);
    const { quietMs } = this.owner.settings;
    this.quietTimer = setTimeout(() => this.lost(generation, new ApiError(0, 'network', `the stream went quiet for ${quietMs} ms`)), quietMs);
  }

  /** The watches of the request given up on that are still their owners'. */
  private owned(): Sub[] {
    return [...this.live.values()].filter((s) => this.owner.current(s) && s.conn === this);
  }

  /** The stream is gone: its watches are told, and it is opened again after a wait (the shortest, and not growing, when it was no failure). */
  private lost(generation: number, error: ApiError, steady = false): void {
    if (generation !== this.generation || this.closed) return;
    const { retryMs, maxRetryMs, jitter, random, stableMs, onRetry } = this.owner.settings;
    if (steady || (this.openedAt && Date.now() - this.openedAt >= stableMs)) this.attempt = 0;
    this.drop();
    this.openedAt = 0;
    for (const s of this.owned()) s.watcher.disconnected(error);
    const wait = Math.max(0, Math.min(retryMs * 2 ** this.attempt, maxRetryMs) * (1 + (random() * 2 - 1) * jitter));
    if (!steady) this.attempt++;
    onRetry?.(wait);
    this.notBefore = Date.now() + wait;
    this.schedule(wait);
  }

  /** The session is over: its watches are told, and nothing is opened again. */
  private halt(error: ApiError): void {
    this.drop();
    for (const s of this.owned()) s.watcher.disconnected(error);
  }

  /** The gateway refused the stream: the watch at fault ends with why, and the others go on (opened again); none named, they all end. */
  private refused(error: ApiError, wire?: string): void {
    const status: Status = error.kubeStatus ?? { kind: 'Status', code: error.status, reason: error.code, message: error.message };
    const owned = this.owned();
    const fault = wire ? owned.find((s) => s.wire === wire) : undefined;
    this.drop();
    this.openedAt = 0;
    for (const s of fault ? [fault] : owned) {
      this.owner.forget(s);
      s.watcher.ended(status);
    }
  }
}
