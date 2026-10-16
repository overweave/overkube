import type { LogCursor, LogLine } from './model.ts';

/*
 * A log's windows by cursor, of its lines in the order written: a line
 * with its pieces (those of no time after it) one; the newest so many, or
 * those just before a window's first. A cursor says where a window begins:
 * its first line's time, and how many of that time it has (the last of
 * those of that time: lines of one time are told apart by their order).
 * What a source holds all of (in memory) answers by these; one that reads
 * a log a window at a time, from a time on, picks the window out of what
 * it read by them too.
 */

/** A log line's time as a key that sorts as the times do: RFC 3339 to the nanosecond, its zeros at the end left out (…:05Z, …:05.5Z) — not as strings sort; none (not a time): '', before any. */
export function logTimeKey(time: string | undefined): string {
  const m = time ? /^([^.]+?)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)$/.exec(time) : null;
  const ms = m ? Date.parse(m[1] + m[3]) : Number.NaN;
  return Number.isNaN(ms) ? '' : `${String(ms + 1e15).padStart(16, '0')}${(m?.[2] ?? '').padEnd(9, '0')}`;
}

/** A line and its pieces. */
export type LogEntry = readonly LogLine[];

/** Lines as entries: each with the pieces after it (pieces with no line before them: an entry of their own). */
export function entriesOf(lines: readonly LogLine[]): LogEntry[] {
  const out: LogLine[][] = [];
  for (const line of lines) {
    const last = out.at(-1);
    if (line.time === undefined && last) last.push(line);
    else out.push([line]);
  }
  return out;
}

const timeOf = (entry: LogEntry) => entry[0].time;

/** Where a window (entries) begins: none for one with no line of a time. */
export function cursorOf(window: readonly LogEntry[]): LogCursor | undefined {
  const time = window.find((e) => timeOf(e) !== undefined)?.[0].time;
  if (time === undefined) return undefined;
  return `${time} ${window.filter((e) => timeOf(e) === time).length}`;
}

/** A cursor's time and count; none: not one. */
export function readCursor(cursor: LogCursor): { time: string; count: number } | undefined {
  const [time, count] = cursor.split(' ');
  const n = Number(count);
  return time && Number.isInteger(n) && n >= 0 ? { time, count: n } : undefined;
}

/**
 * The entries before a cursor, of entries read from some time before it
 * on (in order): those of an earlier time, and of its time all but the
 * last count (compare: times in order).
 */
export function entriesBefore(entries: readonly LogEntry[], at: { time: string; count: number }, compare: (a: string, b: string) => number): LogEntry[] {
  const before = entries.filter((e) => {
    const time = timeOf(e);
    return time !== undefined && compare(time, at.time) < 0;
  });
  const same = entries.filter((e) => timeOf(e) === at.time);
  return [...before, ...same.slice(0, Math.max(0, same.length - at.count))];
}

/** The last limit entries as a window: its lines, and where the one before begins (none: these are all there are). */
export function logWindow(entries: readonly LogEntry[], limit: number, more = entries.length > limit): { lines: LogLine[]; older?: LogCursor } {
  const window = entries.slice(Math.max(0, entries.length - limit));
  const older = more ? cursorOf(window) : undefined;
  return { lines: window.flat(), ...(older ? { older } : {}) };
}
