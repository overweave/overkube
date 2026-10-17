import { type LogQuery, type LogSubscription, STREAM, type StreamLine, type Subscription } from '@overkube/gateway/protocol';
import { ApiError, type Http, type Status } from './http.ts';

/*
 * The page's watches — and logs (logs.ts) — over one /stream, changed
 * while it is open: a watch wanted is added to it, one let go removed — the others' go on as they
 * are. Opened when the first is wanted, closed when the last is let go;
 * opened again — every watch from the last resourceVersion its owner saw —
 * when the gateway lets it go (CLOSE), when it breaks, does not open in
 * time or goes quiet (no PING), after a wait that grows while it keeps
 * failing (begun again once it PINGs).
 *
 * Each time a watch is put on the stream it is a subscription of its own,
 * under an id never used before on it: a line of an earlier one (the same
 * owner, taken off and put on again) never reaches the later one, however
 * the change's answer and the stream's lines cross.
 *
 * Changes wait a moment for others (a page wanting several kinds at once
 * makes one change), one at a time. At most maxSubscriptions are on it
 * (the gateway's limit); past that a watch waits — what nobody uses is let
 * go first (needRoom) — and gets on as soon as there is room.
 *
 * One the gateway ends (410, 403) goes off alone, its owner told; one the
 * gateway refuses (bad_stream) too, the rest of its change made again. A
 * refusal that will never pass (another site's page, a gateway that takes
 * no such request) ends them all; the session over, nothing is asked again.
 */

/** A watch event as the gateway passes it on. */
export interface WatchEvent {
  type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK';
  object: { metadata?: { name?: string; namespace?: string; resourceVersion?: string } } & Record<string, unknown>;
}

/** Who owns a watch: what it watches, where it goes on from, and what it is told. */
export interface Subscriber {
  /** A collection, without a query: /api/v1/pods, /api/v1/namespaces/media/pods. */
  readonly path: string;
  readonly labelSelector?: string;
  readonly fieldSelector?: string;
  readonly projection?: 'metadata';
  /** The last resourceVersion it saw: the watch goes on from there whenever it is put on again. */
  resourceVersion(): string;
  /** The watch is open: events follow. */
  opened(): void;
  event(event: WatchEvent): void;
  /** The gateway lost the watch for now and tries again by itself. */
  retrying(error: { code: string; message: string }): void;
  /** The watch is over (410 Gone, 403, 404, refused): it is off the stream; its owner decides what next. */
  ended(status: Status): void;
  /** The stream broke: what the owner has may be behind until the watch opens again. */
  disconnected(error: ApiError): void;
  /** No room on the stream yet: it gets on when there is. */
  waiting(): void;
}

/** Who owns a log on the stream: which, from where it got to, and what it is told. */
export interface LogSubscriber {
  /** A pod's log: /api/v1/namespaces/<namespace>/pods/<name>/log. */
  readonly path: string;
  /** What it asks for — whenever it is put on again, from where it got to. */
  log(): LogQuery;
  opened(): void;
  /** Its lines as the gateway tells them: "<time> <text>" each. */
  lines(lines: readonly string[]): void;
  /** All of it told, or its container stopped writing: it is off the stream. */
  end(): void;
  retrying(error: { code: string; message: string }): void;
  /** Refused (its container not there, not started): it is off the stream. */
  ended(status: Status): void;
  disconnected(error: ApiError): void;
  waiting(): void;
}

/** What is on the stream: a watch, or a log. */
type Wire = Subscriber | LogSubscriber;
const isLog = (s: Wire): s is LogSubscriber => 'log' in s;

export interface StreamOptions {
  /** How long a change waits for others. */
  debounceMs?: number;
  /** The first wait after the stream failed; doubled each time up to maxRetryMs, ± jitter. */
  retryMs?: number;
  maxRetryMs?: number;
  jitter?: number;
  /** A stream that has not said HELLO in this long is given up. */
  openTimeoutMs?: number;
  /** A change not answered in this long: the stream is taken as broken. */
  changeTimeoutMs?: number;
  /** A stream with no line (the gateway PINGs every 20 s) for this long is taken as broken. */
  quietMs?: number;
  /** As many watches as the gateway takes on one stream. */
  maxSubscriptions?: number;
  /** The longest line taken (one event). */
  maxLineBytes?: number;
  random?: () => number;
  /** Told each wait before the stream is opened again (for tests and logs). */
  onRetry?: (waitMs: number) => void;
}

const DEFAULTS = {
  debounceMs: 10,
  retryMs: 1000,
  maxRetryMs: 30_000,
  jitter: 0.2,
  openTimeoutMs: 15_000,
  changeTimeoutMs: 15_000,
  quietMs: 50_000,
  maxSubscriptions: STREAM.subscriptions as number,
  maxLineBytes: 16 * 1024 * 1024,
  random: Math.random,
};

/** The gateway's refusals that will never pass, asked again: what they end is not tried again. */
const FOR_GOOD = new Set(['cross_site', 'read_only', 'bad_method', 'bad_path', 'too_large', 'bad_body']);
const EVENTS = new Set(['ADDED', 'MODIFIED', 'DELETED', 'BOOKMARK']);
/** A resourceVersion as the gateway takes it; another: from now. */
const sendable = (rv: string) => (/^\S{1,64}$/.test(rv) ? rv : undefined);

export class WatchStream {
  /** Let go of what is not needed (what nobody uses) when there is no room. The feeds set it. */
  needRoom: (() => void) | null = null;
  private readonly http: Http;
  private readonly settings: typeof DEFAULTS & Pick<StreamOptions, 'onRetry'>;
  /** On the stream, or to be put on it. */
  private readonly subs = new Set<Wire>();
  private waiting: Wire[] = [];
  /** Of the stream open now: who each id is, each one's id. */
  private readonly wires = new Map<string, Wire>();
  private readonly wireOf = new Map<Wire, string>();
  private readonly toAdd = new Set<Wire>();
  private readonly toRemove = new Set<string>();
  private seq = 0;
  /** The stream's name, once it said HELLO. */
  private name: string | null = null;
  /** Each opening; lines, failures and answers of one given up on count for nothing. */
  private generation = 0;
  private controller: AbortController | null = null;
  private posting: Promise<void> | null = null;
  private changing: AbortController | null = null;
  /** Changes the gateway turned away for now (its budget, its trouble) in a row; the next not before this. */
  private changeAttempt = 0;
  private notBeforeChange = 0;
  private attempt = 0;
  /** Not opened again before this (a failed stream's wait), whatever comes and goes meanwhile. */
  private notBefore = 0;
  private openTimer: ReturnType<typeof setTimeout> | undefined;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private quietTimer: ReturnType<typeof setTimeout> | undefined;
  /** Why the stream is down, while it waits to be opened again. */
  private down: ApiError | null = null;
  /** The session is over: nothing is asked again. */
  private halted: ApiError | null = null;
  private closed = false;

  constructor(http: Http, options: StreamOptions = {}) {
    this.http = http;
    this.settings = { ...DEFAULTS, ...options };
  }

  /** Watch, or read a log (put on the stream a moment later, or as soon as there is room); its end: the function given back. */
  subscribe(s: Wire): () => void {
    let on = true;
    const off = () => {
      if (!on) return;
      on = false;
      this.unsubscribe(s);
    };
    if (this.closed) return off;
    if (this.halted) {
      s.disconnected(this.halted);
      return off;
    }
    if (this.subs.size >= this.settings.maxSubscriptions) this.needRoom?.();
    if (this.subs.size < this.settings.maxSubscriptions) this.put(s);
    else {
      this.waiting.push(s);
      s.waiting();
    }
    return off;
  }

  /** How many watches are on the stream, or to be put on it. */
  get size(): number {
    return this.subs.size;
  }

  /** How many watches wait for room. */
  get queued(): number {
    return this.waiting.length;
  }

  /** Whether a stream is open, or opening. */
  get open(): boolean {
    return this.controller !== null;
  }

  /** Stop everything: the stream, its timers, its watches (not told: their feeds go with it) — its logs told they are over. */
  close(): void {
    this.closed = true;
    this.drop();
    clearTimeout(this.openTimer);
    const all = [...this.subs, ...this.waiting];
    this.subs.clear();
    this.waiting = [];
    for (const s of all) if (isLog(s)) s.ended({ kind: 'Status', code: 0, reason: 'closed', message: 'the connector is closed' });
  }

  private put(s: Wire): void {
    this.subs.add(s);
    this.toAdd.add(s);
    // The stream down, waiting to be opened again: told at once why (not a bare wait).
    if (!this.controller && this.down) s.disconnected(this.down);
    if (this.controller) this.later();
    else if (!this.openTimer) this.openTimer = setTimeout(() => this.start(), Math.max(0, this.notBefore - Date.now()));
  }

  private unsubscribe(s: Wire): void {
    this.waiting = this.waiting.filter((w) => w !== s);
    if (!this.subs.delete(s)) return;
    this.off(s);
    this.promote();
    this.later();
  }

  /** Off the stream open now: its lines reach it no more; the gateway is told. */
  private off(s: Wire): void {
    this.toAdd.delete(s);
    const wire = this.wireOf.get(s);
    if (wire === undefined) return;
    this.wireOf.delete(s);
    this.wires.delete(wire);
    this.toRemove.add(wire);
  }

  /** Those waiting, on, as long as there is room. */
  private promote(): void {
    while (this.waiting.length && this.subs.size < this.settings.maxSubscriptions) this.put(this.waiting.shift() as Wire);
  }

  /** A change, a moment later (others may come; after a change turned away, not before its wait is over). */
  private later(): void {
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), Math.max(this.settings.debounceMs, this.notBeforeChange - Date.now()));
  }

  /** What changed, sent: one change at a time; with nothing left on it, the stream goes. */
  private flush(): void {
    this.flushTimer = undefined;
    if (this.subs.size === 0) {
      clearTimeout(this.openTimer);
      this.openTimer = undefined;
      this.drop();
      return;
    }
    if (!this.name || this.posting || (this.toAdd.size === 0 && this.toRemove.size === 0)) return;
    const adds = [...this.toAdd];
    const remove = [...this.toRemove];
    this.toAdd.clear();
    this.toRemove.clear();
    /** Who each id of this change is, till it is answered (one let go meanwhile still told apart). */
    const sent = new Map<string, Wire>();
    const add = adds.map((s) => {
      const id = String(++this.seq);
      this.wires.set(id, s);
      this.wireOf.set(s, id);
      sent.set(id, s);
      return subscription(id, s);
    });
    const generation = this.generation;
    const controller = new AbortController();
    this.changing = controller;
    const { changeTimeoutMs } = this.settings;
    const deadline = setTimeout(() => controller.abort(), changeTimeoutMs);
    const posting = this.http
      .changeStream(this.name, { add, remove }, controller.signal)
      .then(
        () => {
          this.changeAttempt = 0;
        },
        (err: unknown) => {
          if (generation !== this.generation) return;
          this.refused(controller.signal.aborted ? new ApiError(0, 'network', `a change to the stream was not answered in ${changeTimeoutMs} ms`) : asError(err), sent, remove);
        },
      )
      .finally(() => clearTimeout(deadline));
    this.posting = posting;
    void posting.finally(() => {
      if (this.posting !== posting) return;
      this.posting = null;
      // What came meanwhile (or was turned away: after its wait), a moment later.
      if (this.toAdd.size || this.toRemove.size) this.later();
    });
  }

  /**
   * A change refused — none of it made: a subscription at fault ends (one
   * let go meanwhile: nothing), the rest is made again; the gateway's budget
   * spent, or its trouble: all of it again after a wait, the stream kept;
   * anything else (no answer, the stream gone): the stream opened again.
   */
  private refused(error: ApiError, sent: Map<string, Wire>, remove: string[]): void {
    const fault = error.code === 'bad_stream' && error.subscription ? sent.get(error.subscription) : undefined;
    const again = error.code === 'too_many_watches' || (error.passing && error.status !== 0);
    if (!fault && !(error.code === 'bad_stream' && error.subscription) && !again) {
      this.failed(this.generation, error);
      return;
    }
    for (const [wire, s] of sent) {
      if (this.wires.get(wire) === s) this.wires.delete(wire);
      if (this.wireOf.get(s) === wire) this.wireOf.delete(s);
      if (s !== fault && this.subs.has(s)) {
        this.toAdd.add(s);
        if (again) s.waiting();
      }
    }
    for (const wire of remove) this.toRemove.add(wire);
    if (fault && this.subs.delete(fault)) fault.ended(statusOf(error));
    if (again) {
      const { retryMs, maxRetryMs } = this.settings;
      this.notBeforeChange = Date.now() + Math.min(retryMs * 2 ** this.changeAttempt++, maxRetryMs);
    }
    this.promote();
    this.later();
  }

  private start(): void {
    this.openTimer = undefined;
    if (this.closed || this.halted || this.subs.size === 0) return;
    this.drop();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const { openTimeoutMs } = this.settings;
    this.deadline = setTimeout(() => this.lost(generation, new ApiError(0, 'network', `the stream did not open in ${openTimeoutMs} ms`)), openTimeoutMs);
    void this.run(generation, controller.signal);
  }

  private async run(generation: number, signal: AbortSignal): Promise<void> {
    const current = () => generation === this.generation;
    try {
      const res = await this.http.openStream(signal);
      if (!current()) return;
      const reader = res.body?.getReader();
      if (!reader) throw new ApiError(0, 'network', 'the stream has no body');
      const decoder = new TextDecoder();
      const { maxLineBytes } = this.settings;
      let rest = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (!current()) return;
        if (done) break;
        this.heard(generation);
        const lines = (rest + decoder.decode(value, { stream: true })).split('\n');
        rest = lines.pop() ?? '';
        if (rest.length > maxLineBytes || lines.some((l) => l.length > maxLineBytes)) throw new ApiError(0, 'network', `the stream sent a line longer than ${maxLineBytes}`);
        for (const text of lines) {
          if (!text.trim()) continue;
          this.line(JSON.parse(text) as StreamLine, generation);
          if (!current()) return;
        }
      }
      this.lost(generation, new ApiError(0, 'network', 'the stream ended'));
    } catch (err) {
      if (current()) this.failed(generation, asError(err));
    }
  }

  private line(line: StreamLine, generation: number): void {
    if (!('f' in line)) {
      if (line.type === 'HELLO') {
        clearTimeout(this.deadline);
        this.down = null;
        this.name = line.stream;
        // Every watch, on the new stream, at once.
        for (const s of this.subs) this.toAdd.add(s);
        this.flush();
      }
      // The stream holds: the next failure waits the shortest again.
      else if (line.type === 'PING') this.attempt = 0;
      // The gateway let the stream go: open it again — a gateway stopping is no failure of the stream's (its wait does not grow).
      else if (line.type === 'CLOSE')
        this.lost(generation, new ApiError(0, 'closed', `the gateway closed the stream: ${line.reason ?? 'no reason given'}`), line.reason === 'shutdown');
      return;
    }
    const s = this.wires.get(line.f);
    if (!s) return;
    // The API server's 401 to a watch: the token signed in with ended, or taken back — the session over.
    if (line.type === 'ERROR' && this.http.tokenSession && (line.object as Status | undefined)?.code === 401) {
      const status = line.object as Status;
      const error = new ApiError(401, 'unauthorized', status.message ?? 'the cluster no longer takes the token signed in with', status);
      this.http.expire(error);
      this.failed(this.generation, error);
      return;
    }
    switch (line.type) {
      case 'OPEN':
        s.opened();
        return;
      case 'RETRY':
        s.retrying(line.error);
        return;
      case 'ERROR':
      case 'END':
        // The gateway stopped it: it goes off (its place given back), its owner decides what next.
        this.subs.delete(s);
        this.off(s);
        this.promote();
        this.later();
        if (line.type === 'END' && isLog(s)) s.end();
        else s.ended(line.type === 'ERROR' ? (line.object as Status) : { kind: 'Status', code: 0, reason: 'ended', message: 'the gateway ended the watch' });
        return;
      case 'LOG':
        if (isLog(s)) s.lines(line.lines);
        return;
      case 'REMOVED':
        return;
      default:
        if (!isLog(s) && EVENTS.has(line.type) && line.object && typeof line.object === 'object') s.event(line as WatchEvent);
    }
  }

  /** Heard from the stream: it is alive for another quietMs. */
  private heard(generation: number): void {
    clearTimeout(this.quietTimer);
    const { quietMs } = this.settings;
    this.quietTimer = setTimeout(() => this.lost(generation, new ApiError(0, 'network', `the stream went quiet for ${quietMs} ms`)), quietMs);
  }

  /** The stream, or a change to it, failed: the session over, a refusal for good, or (anything else) again after a wait. */
  private failed(generation: number, error: ApiError): void {
    if (error.code === 'unauthorized') {
      this.halted = error;
      this.drop();
      for (const s of this.subs) s.disconnected(error);
    } else if (!error.passing && FOR_GOOD.has(error.code)) {
      this.drop();
      const all = [...this.subs, ...this.waiting];
      this.subs.clear();
      this.waiting = [];
      for (const s of all) s.ended(statusOf(error));
    } else this.lost(generation, error);
  }

  /** The stream is gone: its watches are told, and it is opened again after a wait (the shortest, and not growing, when it was no failure). */
  private lost(generation: number, error: ApiError, steady = false): void {
    if (generation !== this.generation || this.closed) return;
    this.drop();
    this.down = error;
    for (const s of this.subs) s.disconnected(error);
    const { retryMs, maxRetryMs, jitter, random, onRetry } = this.settings;
    const wait = steady ? retryMs : Math.max(0, Math.min(retryMs * 2 ** this.attempt, maxRetryMs) * (1 + (random() * 2 - 1) * jitter));
    if (!steady) this.attempt++;
    onRetry?.(wait);
    this.notBefore = Date.now() + wait;
    clearTimeout(this.openTimer);
    this.openTimer = setTimeout(() => this.start(), wait);
  }

  /** Give up on the stream there is: its lines, its changes no longer count. */
  private drop(): void {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.name = null;
    this.posting = null;
    this.changing?.abort();
    this.changing = null;
    this.wires.clear();
    this.wireOf.clear();
    this.toAdd.clear();
    this.toRemove.clear();
    clearTimeout(this.deadline);
    clearTimeout(this.quietTimer);
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
  }
}

function subscription(id: string, s: Wire): Subscription | LogSubscription {
  if (isLog(s)) return { id, path: s.path, log: s.log() };
  const rv = sendable(s.resourceVersion());
  return {
    id,
    path: s.path,
    ...(s.labelSelector ? { labelSelector: s.labelSelector } : {}),
    ...(s.fieldSelector ? { fieldSelector: s.fieldSelector } : {}),
    ...(s.projection ? { projection: s.projection } : {}),
    ...(rv ? { resourceVersion: rv } : {}),
  };
}

const asError = (err: unknown) => (err instanceof ApiError ? err : new ApiError(0, 'network', (err as Error).message));

const statusOf = (error: ApiError): Status => error.kubeStatus ?? { kind: 'Status', code: error.status, reason: error.code, message: error.message };
