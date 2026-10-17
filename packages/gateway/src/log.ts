import type { ClientRequest, IncomingMessage } from 'node:http';
import { LogCursor, type LogQuery, splitLogLine } from './protocol.ts';
import { isDown, openUpstream } from './upstream.ts';
import { countChannel, type Feed, refusal, retryWait, type Settings, type Status, type Stream, tally } from './watch.ts';

/*
 * A container's log in a stream: asked for with its time on every line
 * (timestamps), its lines passed on in batches as they come. Broken off
 * (the API server, the kubelet, the network), it is asked for again from
 * where it got to (a LogCursor: none told twice) after a wait that grows
 * while it keeps failing. Its end (all of it told, or this run of the
 * container ended) is END, and it asks no more; a refusal (the container
 * not there, not started) is ERROR. A line longer than MAX_LOG_LINE is
 * told in pieces (those after the first: no time). It holds a place in the
 * budget of watches until it stops.
 */

/** The longest piece of a line told at once (a line with no end in sight is told in pieces). */
const MAX_LOG_LINE = 256 * 1024;

export interface LogSpec {
  id: string;
  /** /api/v1/namespaces/<namespace>/pods/<name>/log. */
  path: string;
  query: LogQuery;
}

export class LogFeed implements Feed {
  private state: 'idle' | 'opening' | 'open' | 'backoff' | 'stopped' = 'idle';
  private attempt = 0;
  private generation = 0;
  private request: ClientRequest | null = null;
  private answer: IncomingMessage | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Where it got to: where it goes on from. */
  private readonly cursor = new LogCursor();
  private readonly release = countChannel();
  private readonly spec: LogSpec;
  private readonly tag: object;
  private readonly stream: Stream;
  private readonly settings: Settings;

  constructor(spec: LogSpec, tag: object, stream: Stream, settings: Settings) {
    this.spec = spec;
    this.tag = tag;
    this.stream = stream;
    this.settings = settings;
  }

  get id(): string {
    return this.spec.id;
  }

  get stopped(): boolean {
    return this.state === 'stopped';
  }

  start(): void {
    if (this.state === 'stopped') return;
    this.state = 'opening';
    const generation = ++this.generation;
    const current = () => generation === this.generation && this.state !== 'stopped';
    try {
      this.request = openUpstream(
        { method: 'GET', path: `${this.spec.path}?${this.ask()}`, headers: { accept: '*/*' }, connectTimeoutMs: this.settings.connectTimeoutMs },
        this.settings.upstream,
        (answer) => {
          if (current()) this.answered(answer, current);
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

  /** What is asked for: as the client said at first; again, from where it got to (no tail: it has it). */
  private ask(): URLSearchParams {
    const { container, previous, follow, sinceTime, tailLines } = this.spec.query;
    const q = new URLSearchParams({ timestamps: 'true' });
    if (container) q.set('container', container);
    if (previous) q.set('previous', 'true');
    if (follow) q.set('follow', 'true');
    const since = this.cursor.since;
    if (since) {
      this.cursor.again();
      q.set('sinceTime', since);
    } else {
      if (sinceTime) q.set('sinceTime', sinceTime);
      if (tailLines !== undefined) q.set('tailLines', String(tailLines));
    }
    return q;
  }

  stop(): void {
    this.state = 'stopped';
    this.drop();
    this.release();
  }

  pause(): void {
    this.answer?.pause();
  }

  resume(): void {
    this.answer?.resume();
  }

  private drop(): void {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.answer = null;
    this.request?.destroy();
    this.request = null;
  }

  /** Something went wrong for now: the client is told, and it is asked for again (from its last line) after a wait. */
  private fail(code: string, message: string, serverWaitMs?: number): void {
    if (this.state === 'stopped') return;
    this.drop();
    this.state = 'backoff';
    tally('retries');
    this.stream.send({ ...this.tag, type: 'RETRY', error: { code, message } });
    const wait = retryWait(this.settings, this.attempt, serverWaitMs);
    this.attempt++;
    this.timer = setTimeout(() => this.start(), wait);
  }

  /** Over: END (all of it told), or ERROR (refused) — it asks no more. */
  private finish(line: object): void {
    if (this.state === 'stopped') return;
    this.stream.send({ ...this.tag, ...line });
    this.stop();
  }

  private answered(answer: IncomingMessage, current: () => boolean): void {
    if (answer.statusCode !== 200) {
      refusal(answer, this.settings, current, {
        passing: (message, wait) => this.fail('kube_error', message, wait),
        over: (status: Status) => {
          tally('errors');
          this.finish({ type: 'ERROR', object: status });
        },
        broke: () => this.fail('kube_error', 'the API server broke its answer off'),
      });
      return;
    }
    this.state = 'open';
    this.answer = answer;
    if (this.stream.holding) answer.pause();
    this.stream.send({ ...this.tag, type: 'OPEN' });
    const opened = Date.now();
    let rest = '';
    answer.setEncoding('utf8');
    answer.on('data', (chunk: string) => {
      if (!current()) return;
      const whole = (rest + chunk).split('\n');
      rest = whole.pop() ?? '';
      // A long line in pieces, however it came (at once, or with no end in sight yet): the same pieces.
      const lines = whole.flatMap(pieces);
      const unfinished = pieces(rest);
      rest = unfinished.pop() ?? '';
      lines.push(...unfinished);
      const out = lines.filter((line) => this.cursor.take(splitLogLine(line).time));
      if (!out.length) return;
      // Working for a while: the next trouble starts from the shortest wait again (not a few lines, then a break, at once forever).
      if (Date.now() - opened >= this.settings.minLifetimeMs) this.attempt = 0;
      this.stream.send({ ...this.tag, type: 'LOG', lines: out });
    });
    answer.on('end', () => {
      if (!current()) return;
      if (rest && this.cursor.take(splitLogLine(rest).time)) this.stream.send({ ...this.tag, type: 'LOG', lines: [rest] });
      this.finish({ type: 'END' });
    });
    answer.on('close', () => {
      if (current() && !answer.complete) this.fail('kube_error', 'the API server broke the log off');
    });
  }
}

/** A line in pieces of MAX_LOG_LINE at most (by code points: none cut in two); a short one, itself. */
function pieces(line: string): string[] {
  const all: string[] = [];
  let left = line;
  while (left.length > MAX_LOG_LINE) {
    const cut = /[\uD800-\uDBFF]/.test(left[MAX_LOG_LINE - 1]) ? MAX_LOG_LINE - 1 : MAX_LOG_LINE;
    all.push(left.slice(0, cut));
    left = left.slice(cut);
  }
  all.push(left);
  return all;
}
