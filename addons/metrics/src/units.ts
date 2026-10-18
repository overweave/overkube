/*
 * How much is used, as kubectl top says it: CPU in millicores (412m; a
 * part of one, rounded up as kubectl does: 1m), a core and more in cores
 * (2.4 cores); memory in Mi (460Mi; less than one, in Ki), a Gi and more
 * in Gi (1.2Gi); bytes a second (a network's) in KiB/s, MiB/s. A scale
 * chosen by a value (the most of a chart's) says the others in it alike.
 */

export type Resource = 'cpu' | 'memory' | 'rate';

/** A scale: what a value is divided by, its unit, how many decimals it keeps (rounded up: a part of one said as one). */
export interface Scale {
  by: number;
  unit: string;
  decimals: number;
  up?: boolean;
}

const KI = 1024;
const MI = 1024 ** 2;
const GI = 1024 ** 3;

/** The scale a value is said in (cores, bytes, bytes a second). */
export function scaleOf(resource: Resource, value: number): Scale {
  const n = Math.abs(value);
  if (resource === 'cpu') return n < 1 ? { by: 0.001, unit: 'm', decimals: 0, up: true } : { by: 1, unit: ' cores', decimals: n < 10 ? 2 : 1 };
  if (resource === 'memory')
    return n < MI ? { by: KI, unit: 'Ki', decimals: 0 } : n < GI ? { by: MI, unit: 'Mi', decimals: 0 } : { by: GI, unit: 'Gi', decimals: n < 10 * GI ? 2 : 1 };
  return n < MI ? { by: 1024, unit: ' KiB/s', decimals: n < 10 * 1024 ? 1 : 0 } : { by: MI, unit: ' MiB/s', decimals: n < 10 * MI ? 1 : 0 };
}

/** A value in a scale, its decimals kept (trailing zeros gone). */
export const inScale = (value: number, scale: Scale): number => (scale.up ? Math.ceil(Number((value / scale.by).toFixed(6))) : Number((value / scale.by).toFixed(scale.decimals)));

/** A value said, in its own scale (or the one given): 412m, 2.4 cores, 1.2Gi. */
export function said(resource: Resource, value: number, scale = scaleOf(resource, value)): string {
  return `${inScale(value, scale)}${scale.unit}`;
}

/** A part of a whole, in percent (none of it: 0). */
export const percent = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);
