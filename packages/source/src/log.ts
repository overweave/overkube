import { type ApiError, type Connector, compareLogTimes, LOG_WINDOW_BYTES, type LogTarget } from '@overkube/connector';
import { LogCursor } from '@overkube/gateway/protocol';
import {
  entriesBefore,
  entriesOf,
  type GetResult,
  type Live,
  type LogEntry,
  type LogLine,
  type LogQuery,
  type LogResult,
  logWindow,
  type QueryError,
  readCursor,
} from '@overkube/query';
import { signal } from '@preact/signals';
import { queryErrorOf } from './errors.ts';

/*
 * A pod's log as the page answers it, while it is read (asked of the
 * cluster once someone reads it, let go once no one does):
 * - the newest: its last lines (a GET), then — followed — each written after
 *   (over the stream, from where they ended: none twice), the oldest let
 *   go past MAX_FOLLOWED; the run ended (END), or not started yet (400):
 *   said so, and followed again as the pod says its container's run is
 *   another (its restarts, its state) — run after run; ended with its run
 *   still going (the kubelet lets quiet streams go): read on a while after;
 * - a window further back: the API server reads a log only from a time
 *   on, so it is read from a while before the cursor's time (a GET of at
 *   most LOG_WINDOW_BYTES), the lines before the cursor picked out — the
 *   while longer until there are enough of them (or it reaches back past
 *   the pod's start), shorter while the bytes run out before the cursor.
 */

/** The most lines a followed window keeps (the oldest let go: further back, by its older). */
export const MAX_FOLLOWED = 50_000;
/** How far back a window is read at first; the most (a log older than this is not looked for). */
const FIRST_SPAN = 60_000;
const MAX_SPAN = 31 * 24 * 3_600_000;

/** What the page needs of the pod: its creation, its containers' runs. */
interface PodLike {
  metadata?: { creationTimestamp?: string };
  status?: { containerStatuses?: readonly { name: string; restartCount?: number; state?: Record<string, unknown> }[] };
}

/** Which run of the container the pod says it is in: another, its log followed again. */
const runOf = (pod: PodLike | undefined, container?: string) => {
  const s = pod?.status?.containerStatuses?.find((c) => !container || c.name === container);
  return s ? `${s.restartCount ?? 0}/${Object.keys(s.state ?? {})[0] ?? ''}` : '';
};

const errorOf = (err: unknown): QueryError => queryErrorOf(err);
const isDenied = (err: unknown) => (err as ApiError)?.status === 403;

/** A time some milliseconds before another, to the second (as the API server reads sinceTime). */
const back = (time: string, ms: number) => new Date(Math.floor((Date.parse(time) - ms) / 1000) * 1000).toISOString().replace('.000Z', 'Z');

export function pageLog(connector: Connector, podOf: () => Live<GetResult<PodLike>>, query: LogQuery, trouble: () => QueryError | undefined): Live<LogResult> {
  // A last run's log is all written: not followed.
  const follow = query.follow && !query.previous;
  const target: LogTarget = {
    namespace: query.namespace,
    pod: query.name,
    ...(query.container ? { container: query.container } : {}),
    ...(query.previous ? { previous: true } : {}),
  };
  let stop: (() => void) | undefined;
  const result = signal<LogResult>(
    { state: 'loading', lines: [] },
    {
      watched: () => {
        const said = trouble();
        if (said) result.value = { state: 'error', lines: [], error: said };
        else if (!query.kind.startsWith('pods.')) result.value = { state: 'error', lines: [], error: { code: 'not_supported', message: `a log of ${query.kind}: only a pod's` } };
        else stop = query.before ? older(query.before) : newest();
      },
      unwatched: () => {
        stop?.();
        stop = undefined;
      },
    },
  );
  const failed = (err: unknown) => {
    result.value = { ...result.value, state: isDenied(err) ? 'denied' : 'error', error: errorOf(err) };
  };

  /** The newest lines; followed, each written after — run after run. */
  function newest(): () => void {
    const controller = new AbortController();
    const cursor = new LogCursor();
    let entries: LogEntry[] = [];
    let full = false;
    let following: (() => void) | undefined;
    /** The run it last read of (ended, or not started): another, and it is read again. */
    let stoppedAt: string | undefined;
    /** Ended with its run still going: read on after a wait, longer each time nothing came. */
    let again: ReturnType<typeof setTimeout> | undefined;
    let quiet = 0;
    const pod = podOf();
    const shown = () => {
      // Past the most it keeps: the oldest let go (further back, by its older).
      if (entries.length > MAX_FOLLOWED) {
        entries = entries.slice(entries.length - MAX_FOLLOWED);
        full = true;
      }
      return logWindow(entries, MAX_FOLLOWED, full);
    };
    const take = (lines: readonly LogLine[]) => {
      const fresh = lines.filter((l) => cursor.take(l.time));
      if (!fresh.length) return;
      const more = entriesOf(fresh);
      // A piece going on a line already had: on that line.
      const piece = more[0][0].time === undefined && entries.length ? more.shift() : undefined;
      if (piece) entries = [...entries.slice(0, -1), [...(entries.at(-1) as LogEntry), ...piece]];
      entries = [...entries, ...more];
    };
    /** Read its last lines (or, again, from where it got to), then follow it if asked. */
    const read = () => {
      stoppedAt = undefined;
      const since = cursor.since;
      if (since) cursor.again();
      connector
        .readLog(target, since ? { sinceTime: since } : { tailLines: query.limit }, controller.signal)
        .then((window) => {
          if (controller.signal.aborted) return;
          if (!since) full = entriesOf(window.lines).length >= query.limit;
          take(window.lines);
          if (!follow) {
            result.value = { state: 'done', ...shown() };
            return;
          }
          result.value = { state: 'live', ...shown() };
          following?.();
          if (cursor.since) cursor.again();
          following = connector.followLog(target, cursor.since ? { sinceTime: cursor.since } : {}, {
            lines: (lines) => {
              quiet = 0;
              take(lines);
              result.value = { state: 'live', ...shown() };
            },
            state: () => {},
            end: () => {
              const run = runOf(pod.value.object, query.container);
              // Ended, the run still going (the kubelet lets a quiet stream go — after 4 hours by default): read on, a while after.
              if (run.endsWith('/running')) {
                again = setTimeout(read, Math.min(60_000, 2000 * 2 ** quiet++));
                return;
              }
              stoppedAt = run;
              result.value = { ...result.value, state: 'done' };
            },
            ended: (err) => {
              stoppedAt = runOf(pod.value.object, query.container);
              failed(err);
            },
          });
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          stoppedAt = runOf(pod.value.object, query.container);
          failed(err);
        });
    };
    read();
    // The pod's container in another run (restarted, started): read on, if it stopped.
    const offPod = follow
      ? pod.subscribe((p) => {
          if (stoppedAt !== undefined && runOf(p.object, query.container) !== stoppedAt) read();
        })
      : undefined;
    return () => {
      controller.abort();
      clearTimeout(again);
      following?.();
      offPod?.();
    };
  }

  /** The window just before a cursor's: read from a while before its time, the lines before it picked out. */
  function older(before: string): () => void {
    const controller = new AbortController();
    const at = readCursor(before);
    if (!at) {
      result.value = { state: 'error', lines: [], error: { code: 'bad_query', message: `not a cursor of a log: ${before}` } };
      return () => {};
    }
    const pod = podOf();
    const off = pod.subscribe(() => {});
    void (async () => {
      let span = FIRST_SPAN;
      for (;;) {
        const since = back(at.time, span);
        const window = await connector.readLog(target, { sinceTime: since, limitBytes: LOG_WINDOW_BYTES }, controller.signal);
        const entries = entriesOf(window.lines);
        const reached = !window.more || entries.some((e) => e[0].time !== undefined && compareLogTimes(e[0].time, at.time) >= 0);
        // The bytes ran out before the cursor: a shorter while (a second's more than the bytes: what there is).
        if (!reached && span > 1000) {
          span = Math.max(1000, span / 8);
          continue;
        }
        const lines = entriesBefore(entries, at, compareLogTimes);
        const born = Date.parse(pod.value.object?.metadata?.creationTimestamp ?? '');
        const all = span >= MAX_SPAN || Date.parse(since) <= born;
        if (lines.length >= query.limit || all || !reached) return { state: 'done' as const, ...logWindow(lines, query.limit, lines.length > query.limit || !all) };
        span = Math.min(MAX_SPAN, span * 8);
      }
    })().then(
      (done) => {
        if (!controller.signal.aborted) result.value = done;
      },
      (err) => {
        if (!controller.signal.aborted) failed(err);
      },
    );
    return () => {
      controller.abort();
      off();
    };
  }

  return result;
}
