import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http';
import { isDown, openUpstream, type UpstreamSource } from './upstream.ts';

/*
 * Watches kept open against the API server, for a stream of them (the
 * changing stream: stream.ts): each from the last resourceVersion it saw —
 * when the API server ends a watch (it does every few minutes) or the
 * cluster comes back, it goes on from there; tried again after a wait that
 * grows while it fails; its events passed on as one JSON per line, tagged
 * as its stream says, metadata.managedFields left out. The stream holds
 * them back while its client does not read, and lets a slow one go. Over
 * every stream of the process: a budget of streams and watches, a minutely
 * summary.
 */

export interface WatchOptions {
  upstream: UpstreamSource;
  /** How often a PING is sent. */
  pingMs?: number;
  /** The first wait before trying again; doubled each time, up to maxRetryMs, ± jitter (a share of it). */
  retryMs?: number;
  maxRetryMs?: number;
  jitter?: number;
  /** A watch that ends sooner than this, or with no event, is tried again after a wait, not at once. */
  minLifetimeMs?: number;
  /** After a cluster refused bookmarks, how long before they are asked for again. */
  bookmarkRetryMs?: number;
  /** A client that has not read for slowClientMs, or has left this much unread, is let go. */
  maxBufferBytes?: number;
  slowClientMs?: number;
  /** How long a client let go has to take its CLOSE before its connection is cut. */
  closeGraceMs?: number;
  /** The longest line (one event) and error body taken from the API server. */
  maxLineBytes?: number;
  maxErrorBytes?: number;
  connectTimeoutMs?: number;
  /** Watches open at once, over every stream of the process (a followed log through the proxy counts as one). */
  maxChannels?: number;
  /** Streams open at once, over the process. */
  maxStreams?: number;
  /** The streams of one gateway: told CLOSE when it closes. */
  streams?: Set<{ shutdown(): void }>;
  /** Where the minutely summary goes (none when nothing happened). */
  log?: (message: string) => void;
}

const DEFAULTS = {
  pingMs: 20_000,
  retryMs: 1000,
  maxRetryMs: 30_000,
  jitter: 0.2,
  minLifetimeMs: 1000,
  bookmarkRetryMs: 600_000,
  maxBufferBytes: 16 * 1024 * 1024,
  slowClientMs: 30_000,
  closeGraceMs: 5000,
  maxLineBytes: 8 * 1024 * 1024,
  maxErrorBytes: 64 * 1024,
  connectTimeoutMs: 10_000,
  maxChannels: 500,
  maxStreams: 100,
};
export type Settings = typeof DEFAULTS & Pick<WatchOptions, 'upstream' | 'log' | 'streams'>;

/** The options given, over the defaults. */
export const settingsOf = (options: WatchOptions): Settings => ({ ...DEFAULTS, ...options });

export interface Spec {
  id: string;
  /** The collection's path, without a query. */
  path: string;
  /** Its labelSelector and fieldSelector. */
  selectors: URLSearchParams;
  resourceVersion: string;
  /** What it is asked as (default application/json). */
  accept?: string;
}

/** What a watch's line from the API server may be. */
const EVENT_TYPES = new Set(['ADDED', 'MODIFIED', 'DELETED', 'BOOKMARK', 'ERROR']);

// ── Over every stream of the process ──────────────────────────────────────

/**
 * Clusters that refused bookmarks (KubeSolo's storage, kine, does: 500
 * "RequestWatchProgress is disabled"), by API server, until when.
 */
const noBookmarks = new Map<string, number>();

/** What the process carries, for the budget and the minutely summary. */
const totals = { streams: 0, channels: 0, retries: 0, errors: 0 };
let summary: ReturnType<typeof setInterval> | null = null;

/** For tests: the process as if no stream had been served. */
export function resetWatchState(): void {
  noBookmarks.clear();
  Object.assign(totals, { streams: 0, channels: 0, retries: 0, errors: 0 });
  if (summary) clearInterval(summary);
  summary = null;
}

/**
 * A place in the budget of watches for something streamed outside a /stream
 * (a followed log through the proxy): its release, or null when the budget
 * is spent.
 */
export function reserveChannel(maxChannels = DEFAULTS.maxChannels): (() => void) | null {
  if (totals.channels >= maxChannels) return null;
  totals.channels++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    totals.channels--;
  };
}

/** What is open now, and what went wrong since the last summary. */
export function watchTotals(): Readonly<typeof totals> {
  return { ...totals };
}

function summarise(log: (message: string) => void): void {
  if (summary) return;
  summary = setInterval(() => {
    if (totals.streams === 0 && totals.retries === 0 && totals.errors === 0) {
      if (summary) clearInterval(summary);
      summary = null;
      return;
    }
    log(`watch: ${totals.streams} streams, ${totals.channels} watches open; last minute ${totals.retries} retries, ${totals.errors} ended in errors`);
    totals.retries = 0;
    totals.errors = 0;
  }, 60_000);
  summary.unref?.();
}

/** The wait an API server asks for, in seconds, as milliseconds; nothing for what is not a sane one (up to 10 min). */
function serverWait(seconds: unknown): number | undefined {
  return typeof seconds === 'number' && seconds > 0 ? Math.min(seconds, 600) * 1000 : undefined;
}

// ── A stream: one client ──────────────────────────────────────────────────

/** Whether the stream has the budget for this many more watches: if not, why. */
export function overBudget(settings: Settings, more: number): string | undefined {
  if (totals.channels + more > settings.maxChannels) return `${totals.channels} watches are open; at most ${settings.maxChannels}`;
  return undefined;
}

/** Whether another stream may open: if not, why. */
export function tooManyStreams(settings: Settings): string | undefined {
  return totals.streams >= settings.maxStreams ? `${totals.streams} streams are open; at most ${settings.maxStreams}` : undefined;
}

/** The client's side: writes lines, holds the watches back while it does not read, lets a slow one go. */
export class Stream {
  protected open = true;
  private paused = false;
  private slowSince = 0;
  protected readonly channels = new Set<Channel>();
  private readonly ping: ReturnType<typeof setInterval>;
  private readonly res: ServerResponse;
  protected readonly settings: Settings;

  constructor(res: ServerResponse, settings: Settings) {
    this.res = res;
    this.settings = settings;
    // x-accel-buffering: an nginx in front passes each line on at once.
    res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
    totals.streams++;
    summarise(settings.log ?? ((m) => console.log(`[overkube] ${m}`)));
    this.ping = setInterval(() => this.tick(), settings.pingMs);
    res.on('drain', () => this.drained());
    res.on('close', () => this.close());
    settings.streams?.add(this);
  }

  /** Its watches, started (each counted in the budget as it is made). */
  begin(channels: Channel[]): void {
    // Closed already: they give their places in the budget back at once.
    if (!this.open) for (const c of channels) c.stop();
    else {
      for (const c of channels) this.channels.add(c);
      for (const c of channels) c.start();
    }
  }

  /** Whether the client is behind: a watch that opens now waits too. */
  get holding(): boolean {
    return this.paused;
  }

  /** One line to the client; when it is not keeping up, the watches stop reading from the API server. */
  send(line: object): void {
    if (!this.open) return;
    if (!this.res.write(`${JSON.stringify(line)}\n`) && !this.paused) {
      this.paused = true;
      this.slowSince = Date.now();
      for (const c of this.channels) c.pause();
    }
    if (this.res.writableLength > this.settings.maxBufferBytes) this.letGo();
  }

  private drained(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const c of this.channels) c.resume();
  }

  private tick(): void {
    if (!this.paused) {
      this.send({ type: 'PING' });
      return;
    }
    // Held back for this long without a drain: the client is not reading, however little is waiting.
    if (Date.now() - this.slowSince >= this.settings.slowClientMs) this.letGo();
  }

  /**
   * The client reads too slowly: it is told (after what it has not read yet)
   * and the stream ends; its watches go at once, and its connection too if it
   * does not take the CLOSE in a while.
   */
  private letGo(): void {
    if (!this.open) return;
    this.res.end(`${JSON.stringify({ type: 'CLOSE', reason: 'slow_client' })}\n`);
    this.close();
    // Not all of it taken by then (its CLOSE among what is left): its connection cut. ('close' is no sign: an answer ended says it at once.)
    const res = this.res;
    const cut = setTimeout(() => {
      if (!res.writableFinished) res.destroy();
    }, this.settings.closeGraceMs);
    cut.unref?.();
  }

  /** Its gateway closes: the client is told, then the stream ends. */
  shutdown(): void {
    if (!this.open) return;
    this.res.end(`${JSON.stringify({ type: 'CLOSE', reason: 'shutdown' })}\n`);
    this.close();
  }

  protected close(): void {
    if (!this.open) return;
    this.open = false;
    clearInterval(this.ping);
    totals.streams--;
    this.settings.streams?.delete(this);
    for (const c of this.channels) c.stop();
  }
}

// ── A channel: one watch ──────────────────────────────────────────────────

interface Status {
  kind?: string;
  code?: number;
  message?: string;
  details?: { retryAfterSeconds?: number };
}

interface Event {
  type: string;
  object: Status & { metadata?: { resourceVersion?: string; managedFields?: unknown } };
}

/**
 * One watch, kept open against the API server from the last resourceVersion
 * it saw. Its states: opening (a request on its way), open (events coming),
 * backoff (waiting to try again), stopped. Every way out of opening and open
 * goes through restart (at once, quietly), fail (RETRY, then a wait) or
 * finish (ERROR, stopped); each request is a generation, and one given up on
 * can no longer move the channel.
 */
export class Channel {
  private state: 'idle' | 'opening' | 'open' | 'backoff' | 'stopped' = 'idle';
  private resourceVersion: string;
  private attempt = 0;
  private generation = 0;
  private request: ClientRequest | null = null;
  private answer: IncomingMessage | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Whether it is counted in the budget of watches (until it stops). */
  private counted = true;
  private readonly spec: Spec;
  /** What each of its lines is told by: its subscription's id ({ f }).*/
  private readonly tag: object;
  private readonly stream: Stream;
  private readonly settings: Settings;

  constructor(spec: Spec, tag: object, stream: Stream, settings: Settings) {
    this.spec = spec;
    this.tag = tag;
    this.stream = stream;
    this.settings = settings;
    this.resourceVersion = spec.resourceVersion;
    totals.channels++;
  }

  start(): void {
    if (this.state === 'stopped') return;
    this.state = 'opening';
    const generation = ++this.generation;
    const current = () => generation === this.generation && this.state !== 'stopped';
    const upstream = this.settings.upstream;
    let server: string;
    try {
      server = upstream().server;
    } catch (err) {
      this.fail('kube_down', `no cluster to reach: ${(err as Error).message}`);
      return;
    }
    const withBookmarks = (noBookmarks.get(server) ?? 0) <= Date.now();
    const query = new URLSearchParams(this.spec.selectors);
    query.set('watch', '1');
    if (withBookmarks) query.set('allowWatchBookmarks', 'true');
    if (this.resourceVersion) query.set('resourceVersion', this.resourceVersion);
    try {
      this.request = openUpstream(
        { method: 'GET', path: `${this.spec.path}?${query}`, headers: { accept: this.spec.accept ?? 'application/json' }, connectTimeoutMs: this.settings.connectTimeoutMs },
        upstream,
        (answer) => {
          if (current()) this.answered(answer, current, { server, withBookmarks });
          else answer.destroy();
        },
      );
    } catch (err) {
      this.fail('kube_down', `no cluster to reach: ${(err as Error).message}`);
      return;
    }
    this.request.on('error', (err: NodeJS.ErrnoException) => {
      if (current()) this.fail(isDown(err) ? 'kube_down' : 'kube_error', err.message);
    });
  }

  /** The client's name for it. */
  get id(): string {
    return this.spec.id;
  }

  get stopped(): boolean {
    return this.state === 'stopped';
  }

  stop(): void {
    this.state = 'stopped';
    this.drop();
    if (this.counted) totals.channels--;
    this.counted = false;
  }

  pause(): void {
    this.answer?.pause();
  }

  resume(): void {
    this.answer?.resume();
  }

  /** Give up on the current request: it can no longer move the channel. */
  private drop(): void {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.answer = null;
    this.request?.destroy();
    this.request = null;
  }

  /** Again at once, from where it was: the API server ended a watch that had worked. */
  private restart(): void {
    this.drop();
    this.start();
  }

  /**
   * Something went wrong for now: the client is told, and the watch is tried
   * again after a wait — its own, growing each time, or at least as long as
   * the API server asked for (retryAfterSeconds, Retry-After).
   */
  private fail(code: string, message: string, serverWaitMs?: number): void {
    if (this.state === 'stopped') return;
    this.drop();
    this.state = 'backoff';
    totals.retries++;
    this.stream.send({ ...this.tag, type: 'RETRY', error: { code, message } });
    const { retryMs, maxRetryMs, jitter } = this.settings;
    const own = Math.min(retryMs * 2 ** this.attempt, maxRetryMs);
    const wait = serverWaitMs ? Math.max(serverWaitMs, own) * (1 + Math.random() * jitter) : Math.min(Math.max(0, own * (1 + (Math.random() * 2 - 1) * jitter)), maxRetryMs);
    this.attempt++;
    this.timer = setTimeout(() => this.start(), wait);
  }

  /** The watch is over (410, a refusal): the client is told why, and it is not tried again. */
  private finish(status: object): void {
    if (this.state === 'stopped') return;
    totals.errors++;
    this.stream.send({ ...this.tag, type: 'ERROR', object: status });
    this.stop();
  }

  private answered(answer: IncomingMessage, current: () => boolean, ask: { server: string; withBookmarks: boolean }): void {
    if (answer.statusCode !== 200) {
      this.refused(answer, current);
      return;
    }
    this.state = 'open';
    this.answer = answer;
    if (this.stream.holding) answer.pause();
    const opened = Date.now();
    let rest = '';
    this.stream.send({ ...this.tag, type: 'OPEN' });
    answer.setEncoding('utf8');
    answer.on('data', (chunk: string) => {
      if (!current()) return;
      const lines = (rest + chunk).split('\n');
      rest = lines.pop() ?? '';
      // In bytes, a whole line as much as one still coming.
      const tooLong = (s: string) => s.length > this.settings.maxLineBytes / 3 && Buffer.byteLength(s) > this.settings.maxLineBytes;
      if (tooLong(rest) || lines.some(tooLong)) {
        this.fail('kube_error', `an event longer than ${this.settings.maxLineBytes} bytes`);
        return;
      }
      for (const line of lines) {
        if (!line.trim()) continue;
        if (!this.event(line, ask)) return;
        // Working for a while: the next trouble starts from the shortest wait again (not one event, then an error, at once forever).
        if (Date.now() - opened >= this.settings.minLifetimeMs) this.attempt = 0;
      }
    });
    answer.on('end', () => {
      if (!current()) return;
      // The API server ends a watch every so often (30-60 min), events or not — a quiet
      // collection's too, with no bookmarks on KubeSolo: on at once. One that ends straight
      // away (not a watch at all, or failing as it opens) is tried again after a wait.
      if (Date.now() - opened >= this.settings.minLifetimeMs) {
        this.attempt = 0;
        this.restart();
      } else this.fail('kube_error', 'the watch ended as soon as it opened');
    });
    answer.on('close', () => {
      if (current() && !answer.complete) this.fail('kube_error', 'the API server broke the watch off');
    });
  }

  /** One line from the API server; false when the channel moved on because of it. */
  private event(line: string, ask: { server: string; withBookmarks: boolean }): boolean {
    let event: Event;
    try {
      event = JSON.parse(line);
    } catch {
      this.fail('kube_error', 'the API server sent a line that is not JSON');
      return false;
    }
    if (!event || typeof event !== 'object' || !EVENT_TYPES.has(event.type) || !event.object || typeof event.object !== 'object') {
      this.fail('kube_error', 'the API server sent something that is not a watch event');
      return false;
    }
    if (event.type === 'ERROR') {
      const status = event.object;
      if (ask.withBookmarks && status.code === 500 && /RequestWatchProgress/.test(status.message ?? '')) {
        noBookmarks.set(ask.server, Date.now() + this.settings.bookmarkRetryMs);
        this.restart();
        return false;
      }
      // 410: too old to go on from — the end of this watch: the client lists again.
      if (status.code === 410) this.finish(status);
      // Anything else passes (KubeSolo's watch cache lagging: 504 ResourceVersionTooLarge): try again.
      else {
        this.fail('kube_error', status.message ?? `the watch ended with ${status.code ?? 'an error'}`, serverWait(status.details?.retryAfterSeconds));
      }
      return false;
    }
    const metadata = event.object.metadata;
    if (metadata?.resourceVersion) this.resourceVersion = metadata.resourceVersion;
    if (metadata) delete metadata.managedFields;
    // Its type and object only: nothing the API server sends stands for the gateway's tag.
    this.stream.send({ ...this.tag, type: event.type, object: event.object });
    return true;
  }

  /** An answer other than 200: a Status. A server's trouble is tried again; the rest ends the watch. */
  private refused(answer: IncomingMessage, current: () => boolean): void {
    let body = '';
    answer.setEncoding('utf8');
    answer.on('data', (chunk: string) => {
      if (body.length < this.settings.maxErrorBytes) body += chunk.slice(0, this.settings.maxErrorBytes - body.length);
    });
    answer.on('end', () => {
      if (!current()) return;
      const code = answer.statusCode ?? 502;
      let status: Status = { kind: 'Status', code, message: body };
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object') status = parsed;
      } catch {
        // not JSON: its text as the message
      }
      if (code >= 500 || code === 429) {
        this.fail('kube_error', `the API server answered ${code}`, serverWait(Number(answer.headers['retry-after']) || status.details?.retryAfterSeconds));
        return;
      }
      this.finish(status);
    });
    answer.on('close', () => {
      if (current() && !answer.complete) this.fail('kube_error', 'the API server broke its answer off');
    });
  }
}
