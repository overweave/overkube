/*
 * A Kubernetes quantity, as k8s.io/apimachinery/pkg/api/resource (v0.35:
 * Kubernetes 1.35's) parses and keeps it (ParseQuantity, quantity.go): a sign, digits, a fraction,
 * a suffix — binary (Ki…Ei), decimal (n u m "" k M G T P E), or an
 * exponent (e3, E-2; its int64 narrowed to int32, as Go does). Kept as Go
 * keeps it: an int64 and a scale (the fast path: few enough digits, a
 * scale of nano or more), else a decimal — rounded up to nano, a binary one
 * capped at the int64 max. What CEL's quantity library says of it is what
 * Go's Quantity says:
 * - AsInt64 (asInteger, isInteger): the int64 kept, at a scale of 0 or
 *   more — not a decimal, not a negative scale (1000m and 1.5Gi: none);
 * - AsApproximateFloat64 (asApproximateFloat): base × Pow10(exponent),
 *   Go's Pow10 (its tables, products of them).
 * Nothing is worked out to the power of an exponent given: a scale is
 * arithmetic, not a number of so many digits.
 */

const MAX = 2n ** 63n - 1n;
const MIN = -(2n ** 63n);
const NANO = -9;
const DECIMAL = new Map<string, number>([
  ['n', -9],
  ['u', -6],
  ['m', -3],
  ['', 0],
  ['k', 3],
  ['M', 6],
  ['G', 9],
  ['T', 12],
  ['P', 15],
  ['E', 18],
]);
const BINARY = new Map<string, number>([
  ['Ki', 10],
  ['Mi', 20],
  ['Gi', 30],
  ['Ti', 40],
  ['Pi', 50],
  ['Ei', 60],
]);
/** The longest quantity read (Go reads any: past this, none — no quantity is this long). */
const LONGEST = 256;

/** Go's math.Pow10: its tables and their products (not 10 ** n: the same, not always to the last bit). */
const TAB = Array.from({ length: 32 }, (_, i) => Number(`1e${i}`));
const POS32 = Array.from({ length: 10 }, (_, i) => Number(`1e${i * 32}`));
const NEG32 = Array.from({ length: 11 }, (_, i) => Number(`1e-${i * 32}`));
export function pow10(n: number): number {
  if (n >= 0 && n <= 308) return POS32[Math.floor(n / 32)] * TAB[n % 32];
  if (n >= -323 && n <= 0) return NEG32[Math.floor(-n / 32)] / TAB[-n % 32];
  return n > 0 ? Number.POSITIVE_INFINITY : 0;
}

export class Quantity {
  /** The int64 and scale kept (Go's int64Amount): its value value × 10^scale. */
  readonly int?: { readonly value: bigint; readonly scale: number };
  /** Else the decimal kept (Go's inf.Dec): unscaled × 10^-scale. */
  readonly dec?: { readonly unscaled: bigint; readonly scale: number };

  constructor(int?: Quantity['int'], dec?: Quantity['dec']) {
    this.int = int;
    this.dec = dec;
  }

  /** AsInt64: the int64 kept, at a scale of 0 or more (×10^scale, if it does not overflow); else none. */
  integer(): bigint | undefined {
    if (!this.int) return undefined;
    const { value, scale } = this.int;
    if (scale < 0) return undefined;
    let v = value;
    for (let i = 0; i < scale && v !== 0n; i++) {
      v *= 10n;
      if (v > MAX || v < MIN) return undefined;
    }
    return v;
  }

  /** AsApproximateFloat64: base × Pow10(exponent) (a 0 or an exponent of 0: the base). */
  approximate(): number {
    const [base, exponent] = this.int ? [Number(this.int.value), this.int.scale] : [Number(this.dec?.unscaled ?? 0n), -(this.dec?.scale ?? 0)];
    return base === 0 || exponent === 0 ? base : base * pow10(exponent);
  }
}

/** The sign, the digits (leading zeros aside), the fraction, the suffix of a quantity's text, as parseQuantityString takes them; none: undefined. */
function split(text: string): { positive: boolean; value: string; num: string; denom: string; suffix: string } | undefined {
  let pos = 0;
  let positive = true;
  if (text[0] === '-' || text[0] === '+') {
    positive = text[0] === '+';
    pos++;
  }
  while (pos < text.length && text[pos] === '0') pos++;
  if (pos >= text.length) return { positive, value: '0', num: '0', denom: '', suffix: '' };
  let start = pos;
  while (pos < text.length && text[pos] >= '0' && text[pos] <= '9') pos++;
  const num = text.slice(start, pos) || '0';
  let denom = '';
  if (text[pos] === '.') {
    start = ++pos;
    while (pos < text.length && text[pos] >= '0' && text[pos] <= '9') pos++;
    denom = text.slice(start, pos);
  }
  const value = text.slice(0, pos);
  const suffix = text.slice(pos);
  // A suffix: its letters, a sign, digits — nothing else.
  return /^[eEinumkKMGTP]*[-+]?\d*$/.test(suffix) ? { positive, value, num, denom, suffix } : undefined;
}

/** A suffix: its base, exponent, and whether it is binary; none: undefined. */
function interpret(suffix: string): { base: 2 | 10; exponent: number; binary: boolean; decimalExponent: boolean } | undefined {
  const d = DECIMAL.get(suffix);
  if (d !== undefined) return { base: 10, exponent: d, binary: false, decimalExponent: false };
  const b = BINARY.get(suffix);
  if (b !== undefined) return { base: 2, exponent: b, binary: true, decimalExponent: false };
  const m = /^[eE]([-+]?\d+)$/.exec(suffix);
  if (!m) return undefined;
  const parsed = BigInt(m[1]);
  if (parsed > MAX || parsed < MIN) return undefined;
  // Narrowed to int32, as Go stores it.
  return { base: 10, exponent: Number(BigInt.asIntN(32, parsed)), binary: false, decimalExponent: true };
}

/**
 * A decimal at nano's scale, as inf.Dec's Round has it: more digits after
 * its point rounded up (away from 0); fewer, as many zeros put after them.
 * So many zeros that it is past any double (an exponent of a few hundred
 * and more): left as it is — what is said of it is the same (its float:
 * infinite; its int64: none).
 */
function roundUpToNano(unscaled: bigint, scale: number): { unscaled: bigint; scale: number } {
  if (unscaled === 0n) return { unscaled, scale };
  if (scale <= -NANO) return -NANO - scale > 400 ? { unscaled, scale } : { unscaled: unscaled * 10n ** BigInt(-NANO - scale), scale: -NANO };
  const drop = scale + NANO;
  const digits = unscaled.toString().length;
  // More to drop than it has: below the least nano there is, so that one.
  if (drop >= digits) return { unscaled: 1n, scale: -NANO };
  const d = 10n ** BigInt(drop);
  return { unscaled: unscaled / d + (unscaled % d === 0n ? 0n : 1n), scale: -NANO };
}

/** Whether a decimal is above the int64 max (worked out by its digits, not by its value: a scale may be any). */
function aboveMax(unscaled: bigint, scale: number): boolean {
  const whole = unscaled.toString().length - scale;
  if (whole > 19) return true;
  if (whole < 19) return false;
  return (scale >= 0 ? unscaled / 10n ** BigInt(scale) : unscaled * 10n ** BigInt(-scale)) > MAX;
}

/** A quantity of its text, as ParseQuantity has it; none: undefined. */
export function parseQuantity(text: string): Quantity | undefined {
  if (text.length === 0 || text.length > LONGEST) return undefined;
  if (text === '0') return new Quantity({ value: 0n, scale: 0 });
  const parts = split(text);
  if (!parts) return undefined;
  const { positive, value, num, denom, suffix } = parts;
  const how = interpret(suffix);
  if (!how) return undefined;

  let precision = 0;
  let scale = 0;
  let mantissa = 1n;
  if (!how.binary) {
    scale = how.exponent;
    // maxInt64Factors: 18 (apimachinery v0.35).
    precision = 18 - (num.length + denom.length);
  } else if (how.exponent >= 0 && denom.length === 0) {
    mantissa = 1n << BigInt(how.exponent);
    precision = 15 - num.length - Math.trunc((how.exponent * 3) / 10) - 1;
  } else precision = -1;

  if (precision >= 0) {
    scale -= denom.length;
    if (scale >= NANO) {
      const shifted = BigInt(`${num}${denom}`);
      if (shifted <= 2n ** 64n - 1n) {
        const v = positive ? shifted : -shifted;
        if (v >= MIN && v <= MAX) {
          const result = v * mantissa;
          if (result >= MIN && result <= MAX) return new Quantity({ value: result, scale });
        }
      }
    }
  }

  // The decimal: its digits, its point; the suffix taken in (a scale, or ×2^exponent).
  const point = value.indexOf('.');
  let unscaled = BigInt(value.replace('.', '').replace(/^[-+]/, '') || '0');
  let dscale = point < 0 ? 0 : value.length - point - 1;
  if (how.base === 10) {
    if (how.exponent === -(2 ** 31)) return undefined;
    dscale -= how.exponent;
  } else unscaled *= 1n << BigInt(how.exponent);
  ({ unscaled, scale: dscale } = roundUpToNano(unscaled, dscale));
  if (how.binary && aboveMax(unscaled, dscale)) {
    unscaled = MAX;
    dscale = 0;
  }
  return new Quantity(undefined, { unscaled: positive ? unscaled : -unscaled, scale: dscale });
}
