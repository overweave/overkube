/*
 * A cron schedule (as a CronJob says one: five fields — minute, hour, day of
 * the month, month, day of the week — or a macro: @hourly, @daily…), and
 * when it runs next after a time, in a time zone (its own: none, UTC — as
 * the controller has it). Each field a list of ranges, steps, names (jan,
 * mon); a day of the month and of the week both said: either one — a field
 * of every value (a star or ?, stepped by 1 or not) saying nothing — as the controller's parser
 * (robfig/cron) has it. @every <duration>: no wall clock, only its period.
 * A wall time a clock change skips never runs; one it repeats runs twice.
 * Not one: undefined.
 */

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

interface Field {
  /** The values it takes. */
  values: Set<number>;
  /** Every value (*): not a restriction (a day's, either-or). */
  any: boolean;
}

export interface Cron {
  /** @every <duration>: its period (ms) — when it runs is the controller's, from when it last did. */
  every?: number;
  minute: Field;
  hour: Field;
  day: Field;
  month: Field;
  weekday: Field;
}

/** A field's values, of its range (names its own: months 1-12, days 0-6 — 7 too, Sunday); not one: undefined. */
function field(text: string, min: number, max: number, names: string[] = [], base = 0): Field | undefined {
  const values = new Set<number>();
  let any = false;
  const value = (v: string) => {
    const at = names.indexOf(v.toLowerCase());
    if (at >= 0) return at + base;
    return /^\d+$/.test(v) ? Number(v) : Number.NaN;
  };
  for (const part of text.split(',')) {
    const [range, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!range || !Number.isInteger(step) || step < 1) return undefined;
    const [from, to] =
      range === '*' || range === '?' ? [min, max] : range.includes('-') ? range.split('-').map(value) : [value(range), stepText === undefined ? value(range) : max];
    if (from === undefined || to === undefined || Number.isNaN(from) || Number.isNaN(to) || from < min || to > max || from > to) return undefined;
    for (let v = from; v <= to; v += step) values.add(v);
    // Every value, one by one: no restriction (a step over them is one).
    if ((range === '*' || range === '?') && step === 1) any = true;
  }
  return { values, any };
}

const UNITS: Record<string, number> = { h: 3_600_000, m: 60_000, s: 1000, ms: 1, us: 0.001, µs: 0.001, ns: 0.000001 };

/** A Go duration (1h30m, 90s) in ms; not one: undefined. */
function duration(text: string): number | undefined {
  const parts = [...text.matchAll(/(\d+(?:\.\d+)?)(h|ms|m|s|us|µs|ns)/g)];
  if (!parts.length || parts.map((p) => p[0]).join('') !== text) return undefined;
  const ms = parts.reduce((sum, p) => sum + Number(p[1]) * (UNITS[p[2] as string] as number), 0);
  return ms > 0 ? ms : undefined;
}

/** A schedule read (five fields, a macro, @every <duration>); not one: undefined. */
export function parseCron(text: string): Cron | undefined {
  const every = /^@every\s+(\S+)$/.exec(text.trim());
  if (every) {
    const ms = duration(every[1] as string);
    const all = { values: new Set<number>(), any: true };
    return ms === undefined ? undefined : { every: ms, minute: all, hour: all, day: all, month: all, weekday: all };
  }
  const fields = (MACROS[text.trim()] ?? text).trim().split(/\s+/);
  if (fields.length !== 5) return undefined;
  const [minute, hour, day, month, weekday] = [
    field(fields[0] as string, 0, 59),
    field(fields[1] as string, 0, 23),
    field(fields[2] as string, 1, 31),
    field(fields[3] as string, 1, 12, MONTHS, 1),
    field(fields[4] as string, 0, 7, DAYS),
  ];
  if (!minute || !hour || !day || !month || !weekday) return undefined;
  // Sunday is 0 and 7.
  if (weekday.values.has(7)) weekday.values.add(0);
  return { minute, hour, day, month, weekday };
}

/** A formatter of wall clocks in each time zone (made once: making one is slow). */
const formatters = new Map<string, Intl.DateTimeFormat>();

/** A time's wall clock in a time zone: its year, month (1-12), day, hour, minute — as ms of a UTC date of the same fields. */
function wall(at: number, zone: string): number {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    formatters.set(zone, format);
  }
  const parts = format.formatToParts(at);
  const of = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(of('year'), of('month') - 1, of('day'), of('hour'), of('minute'));
}

/** The times a wall clock is in a time zone, in order: none (a clock change skips it), one, or two (one repeats it). */
function instants(clock: number, zone: string): number[] {
  // Its offset a day either side and at it: every offset it may be read with.
  const offsets = new Set([clock - 86_400_000, clock, clock + 86_400_000].map((t) => wall(t, zone) - t));
  return [...offsets]
    .map((offset) => clock - offset)
    .filter((t) => wall(t, zone) === clock)
    .sort((a, b) => a - b);
}

const HOUR = 3_600_000;

/** When it runs next after a time (ms), in a time zone (none: UTC); @every, or not within four years (a 30th of February): undefined. */
export function nextRun(cron: Cron, after: number, zone = 'UTC'): number | undefined {
  if (cron.every !== undefined) return undefined;
  const dayOk = (date: Date) => {
    const byDay = cron.day.values.has(date.getUTCDate());
    const byWeekday = cron.weekday.values.has(date.getUTCDay());
    // Both said: either; one said, that one.
    return cron.day.any && cron.weekday.any ? true : cron.day.any ? byWeekday : cron.weekday.any ? byDay : byDay || byWeekday;
  };
  const now = wall(after, zone);
  // No clock change within three hours of it: a wall time not after now's is past.
  const steady = [after - 3 * HOUR, after + 3 * HOUR].every((t) => wall(t, zone) - t === now - after);
  const hours = [...cron.hour.values].sort((a, b) => a - b);
  const minutes = [...cron.minute.values].sort((a, b) => a - b);
  const today = now - (now % 86_400_000);
  for (let i = 0; i < 366 * 4; i++) {
    const day = today + i * 86_400_000;
    const date = new Date(day);
    if (!cron.month.values.has(date.getUTCMonth() + 1) || !dayOk(date)) continue;
    // The day's first after it (a repeated hour's times interleave: 01:30, 01:45, then 01:30 again).
    let first: number | undefined;
    let until = Number.POSITIVE_INFINITY;
    times: for (const h of hours)
      for (const mi of minutes) {
        const clock = day + h * HOUR + mi * 60_000;
        // Well before now on the wall: past (a repeated hour aside, two at most).
        if (clock < now - 3 * HOUR || (steady && clock <= now)) continue;
        // Past what is found by more than a clock change: no earlier one to come.
        if (clock > until) break times;
        const at = instants(clock, zone).find((t) => t > after);
        if (at !== undefined && (first === undefined || at < first)) {
          first = at;
          until = clock + 3 * HOUR;
        }
      }
    if (first !== undefined) return first;
  }
  return undefined;
}
