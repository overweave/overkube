import { LogCursor, type LogQuery, splitLogLine } from '@overkube/gateway/protocol';
import { ApiError, type Http, type Status } from './http.ts';
import type { WatchStream } from './stream.ts';

/*
 * A container's log: followed over the page's stream (its last lines, then
 * each as it is written, until this run of the container ends), or read a
 * window at a time with a GET (from a time, so many bytes — what is further
 * back, asked for as it is scrolled to). Its lines come with the time each
 * was written. Followed and put on the stream again (the stream broke, came
 * back), it asks from where it got to (a LogCursor): none comes twice.
 */

/** A line of a log: when it was written (RFC 3339, to the nanosecond), what it says; no time: it goes on the line before (a piece of a long one). */
export interface LogLine {
  time?: string;
  text: string;
}

/** Whose log: a pod's container (none: its only one), its last run's if asked. */
export interface LogTarget {
  namespace: string;
  pod: string;
  container?: string;
  previous?: boolean;
}

/** Where to begin: a time (at or after), or its last lines only. */
export interface LogFrom {
  sinceTime?: string;
  tailLines?: number;
}

/** A window read: its lines, and whether there is more after them (the bytes asked for ran out: read on from the last line's time). */
export interface LogWindow {
  lines: LogLine[];
  more: boolean;
}

/** The most a window reads at once. */
export const LOG_WINDOW_BYTES = 4 * 1024 * 1024;

/** What a followed log tells: its lines; how it is (open, the stream down for now, waiting for room); its end (this run ended), or why not (refused). */
export interface LogHandlers {
  lines(lines: readonly LogLine[]): void;
  state(state: 'open' | 'retrying' | 'disconnected' | 'waiting', error?: { code: string; message: string }): void;
  end(): void;
  ended(error: ApiError): void;
}

/** A pod's log, as the API has it. */
export const logPath = (target: Pick<LogTarget, 'namespace' | 'pod'>) => `/api/v1/namespaces/${target.namespace}/pods/${target.pod}/log`;

const whose = (target: LogTarget): LogQuery => ({ ...(target.container ? { container: target.container } : {}), ...(target.previous ? { previous: true } : {}) });

const refusal = (status: Status) => new ApiError(status.code ?? 0, status.reason ?? 'refused', status.message ?? `the log was refused (${status.code ?? 'no code'})`, status);

/** A log followed: its last lines (or from a time), then each as it is written, until this run ends or it is let go of (the function given back). */
export function followLog(stream: WatchStream, target: LogTarget, from: LogFrom, told: LogHandlers): () => void {
  const cursor = new LogCursor();
  return stream.subscribe({
    path: logPath(target),
    log: () => {
      const since = cursor.since;
      if (!since) return { ...whose(target), ...from, follow: true };
      cursor.again();
      return { ...whose(target), sinceTime: since, follow: true };
    },
    opened: () => told.state('open'),
    lines: (raw) => {
      const lines = raw.map(splitLogLine).filter((l) => cursor.take(l.time));
      if (lines.length) told.lines(lines);
    },
    end: () => told.end(),
    retrying: (error) => told.state('retrying', error),
    ended: (status) => told.ended(refusal(status)),
    disconnected: (error) => told.state('disconnected', error),
    waiting: () => told.state('waiting'),
  });
}

/** A window of a log read once (a GET): from a time (or its last lines), at most limitBytes if asked (LOG_WINDOW_BYTES at most) — a line they cut short left for the next. */
export async function readLog(http: Http, target: LogTarget, window: LogFrom & { limitBytes?: number }, signal?: AbortSignal): Promise<LogWindow> {
  const limit = window.limitBytes === undefined ? undefined : Math.min(window.limitBytes, LOG_WINDOW_BYTES);
  const text = await http.text(
    logPath(target),
    {
      timestamps: 'true',
      container: target.container,
      previous: target.previous ? 'true' : undefined,
      sinceTime: window.sinceTime,
      tailLines: window.tailLines === undefined ? undefined : String(window.tailLines),
      limitBytes: limit === undefined ? undefined : String(limit),
    },
    signal,
  );
  const raw = text.split('\n');
  const rest = raw.pop() ?? '';
  // Not ending in a line break: its last line cut short by the limit (left for the next window, which begins at its time) — with no limit, written so (kept).
  if (rest && limit === undefined) raw.push(rest);
  return { lines: raw.map(splitLogLine), more: limit !== undefined && (rest !== '' || new TextEncoder().encode(text).length >= limit) };
}
