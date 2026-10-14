import type { FieldDef, Value } from '@overkube/query';
import type { CellValue } from '@overkube/sdk';

/*
 * A cell's text, of its values as their field's definition says them (a
 * column with no format of its own): a time, how long ago (live: as now
 * changes); a quantity in its unit (cores: 250m, 2; bytes: 1.5Gi); a bool,
 * a check; several values, one after another; none, "—". As kubectl writes
 * them, where it does.
 */

/** What an empty cell shows. */
export const EMPTY = '—';

/** kubectl's words for nothing there: drawn as nothing ("—"); its others (<pending>, <unknown>) say a state, and stay. */
const NOTHING = new Set(['', '<none>', '<unset>']);

/** A text as drawn: nothing (empty, none, kubectl's <none>) "—". */
export const shownAs = (display: unknown): string => (display === undefined || display === null || NOTHING.has(display as string) ? EMPTY : String(display));

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

/** A time as ms (ms already, or RFC 3339); none: NaN. */
export const msOf = (v: Value): number => (typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : Number.NaN);

const BINARY = ['', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei'];

/** Bytes as the API writes a quantity of them: in the largest binary unit it is a whole number of tenths of (1.5Gi, 512Mi). */
export function bytes(n: number): string {
  let i = 0;
  let v = n;
  while (Math.abs(v) >= 1024 && i < BINARY.length - 1) {
    v /= 1024;
    i++;
  }
  return `${Math.round(v * 10) / 10}${BINARY[i]}`;
}

/** Cores as the API writes them: whole ones as they are, the rest in millicores (250m). */
export const cores = (n: number): string => (Number.isInteger(n) ? String(n) : `${Math.round(n * 1000)}m`);

/** One value as its field's type says it. */
function one(v: Value, def: Pick<FieldDef, 'type' | 'unit'> | undefined, now: number): string {
  if (def?.type === 'time') {
    const at = msOf(v);
    return Number.isNaN(at) ? EMPTY : humanDuration(now - at);
  }
  if (typeof v === 'number' && def?.unit === 'bytes') return bytes(v);
  if (typeof v === 'number' && def?.unit === 'cores') return cores(v);
  if (typeof v === 'boolean') return v ? '✓' : '';
  return String(v);
}

/** A field's value as text (several: one after another; none: "—"). */
export function formatted(value: CellValue | undefined, def: Pick<FieldDef, 'type' | 'unit'> | undefined, now: number): string {
  if (value === null || value === undefined) return EMPTY;
  const text = Array.isArray(value) ? (value as readonly Value[]).map((v) => one(v, def, now)).join(', ') : one(value as Value, def, now);
  return text === '' ? EMPTY : text;
}
