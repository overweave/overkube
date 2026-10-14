/*
 * Strings as Go and SQL have them, not as JS does: ordered by code point
 * (UTF-8's bytes in order: Go's <, SQLite's BINARY, Postgres's "C"), not by
 * UTF-16 code unit (an astral character before U+E000…U+FFFF); a lone
 * surrogate U+FFFD (as Go reads it of JSON); UTF-8 bytes made and read (Go's
 * \x escapes are bytes).
 */

const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** A string as Go has it of JSON: each lone surrogate U+FFFD. */
export function wellFormed(s: string): string {
  return /[\ud800-\udfff]/.test(s) ? s.replace(LONE, '\ufffd') : s;
}

/** a against b by code point (a lone surrogate: U+FFFD): below 0, 0, above 0. */
export function byCodePoint(a: string, b: string): number {
  if (a === b) return 0;
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  if (i === n) return a.length - b.length;
  let x = a.charCodeAt(i);
  let y = b.charCodeAt(i);
  const surrogate = (c: number) => c >= 0xd800 && c <= 0xdfff;
  if (surrogate(x) || surrogate(y)) {
    const wa = wellFormed(a);
    const wb = wellFormed(b);
    if (wa !== a || wb !== b) return byCodePoint(wa, wb);
    // Paired: of a character past U+FFFF, after every other.
    if (surrogate(x)) x += 0x10000;
    if (surrogate(y)) y += 0x10000;
  }
  return x - y;
}

/** A string's UTF-8 bytes (a lone surrogate: U+FFFD's). */
export function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of wellFormed(s)) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return out;
}

/** UTF-8 bytes as a string (what is not UTF-8: U+FFFD, a byte at a time). */
export function fromUtf8(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    const need = b < 0x80 ? 0 : b >= 0xc2 && b < 0xe0 ? 1 : b >= 0xe0 && b < 0xf0 ? 2 : b >= 0xf0 && b < 0xf5 ? 3 : -1;
    let c = need === 0 ? b : need === 1 ? b & 0x1f : need === 2 ? b & 0x0f : b & 0x07;
    let ok = need >= 0 && i + need < bytes.length;
    for (let k = 1; ok && k <= need; k++) {
      const next = bytes[i + k];
      if ((next & 0xc0) !== 0x80) ok = false;
      else c = (c << 6) | (next & 0x3f);
    }
    const min = [0, 0x80, 0x800, 0x10000][need] ?? 0;
    if (!ok || c < min || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) {
      out += '�';
      i++;
    } else {
      out += String.fromCodePoint(c);
      i += need + 1;
    }
  }
  return out;
}
