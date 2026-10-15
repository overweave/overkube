import { slotElement } from '@overweave/ui/preact';
import { useMemo } from 'preact/hooks';
import { type KindTableProps, slots } from '../slots.ts';

/**
 * A table of a kind's objects, on any page: drawn by the kind.table slot's
 * fill (the core's, or another's in its place) — <KindTable kind={…}
 * where={…} scope={…} title="…" />, as many as wanted.
 */
export function KindTable({ kind, where, scope, title, plain }: KindTableProps) {
  // The same props while they are the same (the table not drawn again for its parent's drawing).
  const props = useMemo(() => ({ kind, where, scope, title, plain }), [kind, JSON.stringify(where), JSON.stringify(scope), title, plain]);
  return slotElement(slots.kind.table, props, { limit: 1 });
}
