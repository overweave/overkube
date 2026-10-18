/*
 * Times as overkube shows them: one as the page's clock does, to the
 * minute (a time as said, or ms); how long ago, as kubectl says it; days
 * from today, as the page's calendar has them.
 */

/** A time as the page's clock shows it, to the minute: 2026-10-10 22:59 (unreadable: as it is). */
export function shortTime(time: string | number): string {
  const at = new Date(time);
  if (Number.isNaN(at.getTime())) return String(time);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
}

/** How long a time is ago, as kubectl's HumanDuration says it: 45s, 3m20s, 5h, 2d3h, 1y40d. */
export function humanDuration(ms: number): string {
  const seconds = Math.trunc(ms / 1000);
  // A machine's clock off by up to 2s is now.
  if (seconds < -1) return '<invalid>';
  if (seconds < 0) return '0s';
  if (seconds < 60 * 2) return `${seconds}s`;
  const minutes = Math.trunc(ms / 60_000);
  if (minutes < 10) {
    const s = seconds % 60;
    return s === 0 ? `${minutes}m` : `${minutes}m${s}s`;
  }
  if (minutes < 60 * 3) return `${minutes}m`;
  const hours = Math.trunc(ms / 3_600_000);
  if (hours < 8) {
    const m = minutes % 60;
    return m === 0 ? `${hours}h` : `${hours}h${m}m`;
  }
  if (hours < 48) return `${hours}h`;
  if (hours < 24 * 8) {
    const h = hours % 24;
    return h === 0 ? `${Math.trunc(hours / 24)}d` : `${Math.trunc(hours / 24)}d${h}h`;
  }
  if (hours < 24 * 365 * 2) return `${Math.trunc(hours / 24)}d`;
  if (hours < 24 * 365 * 8) {
    const d = Math.trunc(hours / 24) % 365;
    return d === 0 ? `${Math.trunc(hours / 24 / 365)}y` : `${Math.trunc(hours / 24 / 365)}y${d}d`;
  }
  return `${Math.trunc(hours / 24 / 365)}y`;
}

/** Days from now's date to a time's, as the page's clock has them (tomorrow: 1, however few hours away). */
export function calendarDays(time: number, now: number): number {
  const day = (ms: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  return Math.round((day(time) - day(now)) / 86_400_000);
}
