/*
 * Lists in an order the user made, some of their items not drawn now (a
 * kind the cluster does not serve, a column not shown for this list): the
 * new order of those drawn, with the others kept where they were.
 */

/**
 * A list's new order, with those left out of it (not drawn now: a kind the
 * cluster does not serve) where they were: each before the one it came
 * before (the last ones, last).
 */
export function keepHidden(shown: readonly string[], before: readonly string[]): string[] {
  const out = [...shown];
  for (let i = before.length - 1; i >= 0; i--) {
    const key = before[i];
    if (out.includes(key)) continue;
    const next = before.slice(i + 1).find((k) => out.includes(k));
    out.splice(next === undefined ? out.length : out.indexOf(next), 0, key);
  }
  return out;
}
