/*
 * The same value, the same text, the same hash — wherever it is worked out
 * (a field's version, a cursor's tag: the page's and a server's alike).
 */

/** JSON with its keys in order (an undefined one left out). */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (typeof v === 'object' && v !== null)
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

/** FNV-1a of a text (its UTF-16 code units), 64 bits, as hex (16 digits): a version, a tag. */
export function fnv1a64(text: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) h = BigInt.asUintN(64, (h ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n);
  return h.toString(16).padStart(16, '0');
}

/** FNV-1a of a text (its UTF-16 code units), 32 bits, as hex: for what may collide now and then. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}
