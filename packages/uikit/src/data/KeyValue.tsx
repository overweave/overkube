import type { ComponentChildren } from 'preact';

/*
 * Names and their values: side by side, the names' column at most a third
 * or so; narrow, each name over its value (as wide as it is, not the page).
 * A value missing (undefined, null) shows as a dash; nothing else is
 * missing (0, an empty string are values).
 */
export function KeyValue({ rows }: { rows: [string, ComponentChildren][] }) {
  return (
    <dl class="uk-kv">{rows.flatMap(([k, v], i) => [<dt key={`k${i}`}>{k}</dt>, <dd key={`v${i}`}>{v === undefined || v === null ? <span class="uk-muted">—</span> : v}</dd>])}</dl>
  );
}
