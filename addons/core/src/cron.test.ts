import { describe, expect, it } from 'vitest';
import { nextRun, parseCron } from './cron.ts';

/* A cron schedule read, and when it runs next — in UTC and a time zone (across a clock change), either-or days, macros, names; one not a schedule: none. */

const at = (iso: string) => Date.parse(iso);
const next = (schedule: string, after: string, zone?: string) => {
  const cron = parseCron(schedule);
  const t = cron && nextRun(cron, at(after), zone);
  return t === undefined ? undefined : new Date(t).toISOString();
};

describe('a cron schedule', () => {
  it('reads fields: lists, ranges, steps, names, macros; not one: none', () => {
    expect([...(parseCron('*/15 9-17 * jan-mar mon,fri')?.minute.values ?? [])]).toEqual([0, 15, 30, 45]);
    expect([...(parseCron('*/15 9-17 * jan-mar mon,fri')?.month.values ?? [])]).toEqual([1, 2, 3]);
    expect([...(parseCron('*/15 9-17 * jan-mar mon,fri')?.weekday.values ?? [])]).toEqual([1, 5]);
    expect(parseCron('@daily')?.hour.values).toEqual(new Set([0]));
    expect([parseCron('61 * * * *'), parseCron('* * *'), parseCron('*/0 * * * *'), parseCron('5-1 * * * *'), parseCron('x * * * *')]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('runs next after a time, in UTC: the same day, the next, at a month’s start, on a weekday (Sunday 7 too)', () => {
    expect(next('0 3 * * *', '2026-10-15T01:00:00Z')).toBe('2026-10-15T03:00:00.000Z');
    expect(next('0 3 * * *', '2026-10-15T03:00:00Z')).toBe('2026-10-16T03:00:00.000Z');
    expect(next('@monthly', '2026-10-15T00:00:00Z')).toBe('2026-11-01T00:00:00.000Z');
    expect(next('30 8 * * 7', '2026-10-15T00:00:00Z')).toBe('2026-10-18T08:30:00.000Z');
  });

  it('takes a day of the month or of the week, both said; a 30th of February never', () => {
    // The 20th, or a Monday: Monday the 19th first.
    expect(next('0 0 20 * mon', '2026-10-15T12:00:00Z')).toBe('2026-10-19T00:00:00.000Z');
    expect(next('0 0 30 2 *', '2026-10-15T00:00:00Z')).toBeUndefined();
  });

  it('runs in its time zone: Berlin’s 03:00 is 01:00 UTC in summer, 02:00 in winter', () => {
    expect(next('0 3 * * *', '2026-07-01T00:00:00Z', 'Europe/Berlin')).toBe('2026-07-01T01:00:00.000Z');
    expect(next('0 3 * * *', '2026-12-01T00:00:00Z', 'Europe/Berlin')).toBe('2026-12-01T02:00:00.000Z');
    // The night clocks go back (25 October 2026): 03:00 once, at 02:00 UTC.
    expect(next('0 3 * * *', '2026-10-24T23:00:00Z', 'Europe/Berlin')).toBe('2026-10-25T02:00:00.000Z');
  });

  it('skips a wall time the clock change skips; runs twice in an hour it repeats, in time order', () => {
    // Berlin, 29 March 2026: 02:00 → 03:00, no 02:30 that night.
    expect(next('30 2 * * *', '2026-03-28T12:00:00Z', 'Europe/Berlin')).toBe('2026-03-30T00:30:00.000Z');
    // New York, 1 November 2026: 01:00–02:00 twice (EDT, then EST).
    expect(next('30 1 * * *', '2026-11-01T04:00:00Z', 'America/New_York')).toBe('2026-11-01T05:30:00.000Z');
    expect(next('30 1 * * *', '2026-11-01T05:30:00Z', 'America/New_York')).toBe('2026-11-01T06:30:00.000Z');
    expect(next('*/15 1 * * *', '2026-11-01T05:30:00Z', 'America/New_York')).toBe('2026-11-01T05:45:00.000Z');
    expect(next('*/15 1 * * *', '2026-11-01T05:45:00Z', 'America/New_York')).toBe('2026-11-01T06:00:00.000Z');
  });
});

describe('a cron schedule as the controller reads it', () => {
  it('takes */1 for every day (the weekday alone holds), */2 for some (either holds)', () => {
    // Thursday the 15th: */1 says nothing — Monday the 19th; */2 — the 17th (odd), before Monday.
    expect(next('0 0 */1 * mon', '2026-10-15T12:00:00Z')).toBe('2026-10-19T00:00:00.000Z');
    expect(next('0 0 */2 * mon', '2026-10-15T12:00:00Z')).toBe('2026-10-17T00:00:00.000Z');
  });

  it('reads @every <duration>: its period, no time it runs at', () => {
    const every = parseCron('@every 1h30m');
    expect([every?.every, every && nextRun(every, at('2026-10-15T00:00:00Z')), parseCron('@every soon')]).toEqual([5_400_000, undefined, undefined]);
  });

  it('works out a run each minute quickly — a minute before midnight, in a time zone', () => {
    const cron = parseCron('* * * * *');
    const start = performance.now();
    for (let i = 0; i < 200 && cron; i++) nextRun(cron, at('2026-10-15T21:58:00Z') + i * 1000, 'Europe/Berlin');
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
