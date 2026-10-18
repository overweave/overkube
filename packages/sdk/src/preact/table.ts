import { slotElement, useDefinition } from '@overweave/ui/preact';
import { useMemo } from 'preact/hooks';
import { TableView } from '../kinds.ts';
import { type KindProps, type KindTableProps, slots } from '../slots.ts';
import type { Label } from '../text.ts';
import { useUser } from './user.ts';

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

/**
 * A kind's filter, on any page (an addon's: what it shows filtered by a
 * kind's objects): drawn by the kind.filter slot's fill (the core's: as a
 * kind's page's) — what is typed made CEL, kept in the page's link
 * (?filter=: filteredIn(path) reads it).
 */
export function KindFilter({ kind, placeholder }: { kind: KindProps['kind']; placeholder?: Label }) {
  const props = useMemo(() => ({ kind, ...(placeholder ? { placeholder } : {}) }), [kind, placeholder]);
  return slotElement(slots.kind.filter, props, { limit: 1 });
}

/** How a table is sorted: by a column, either way (the kit's TableSort). */
interface Sorted {
  id: string;
  desc?: boolean;
}

/**
 * A table of no one kind (a panel's, an addon's page's), set out as the
 * user sets it and kept, as a kind's is: its own TableView (named for
 * itself; its owner declares it) — its columns' order, their widths, how
 * it is sorted (none: as its rows are given). What a kit's Table takes:
 * {...useTableView(name, columns)}.
 */
export function useTableView<C extends { id: string; width?: string }>(name: string, columns: readonly C[]) {
  const user = useUser();
  const view = useDefinition(TableView, name)?.spec ?? {};
  const order = view.columns ?? [];
  const sort: Sorted | undefined = view.sort ? { id: view.sort.column, desc: view.sort.descending ?? false } : undefined;
  const placed = [...order.flatMap((id) => columns.filter((c) => c.id === id)), ...columns.filter((c) => !order.includes(c.id))].map((c) =>
    view.widths?.[c.id] ? { ...c, width: `${view.widths[c.id]}px` } : c,
  );
  return {
    columns: placed,
    ...(sort ? { sort } : {}),
    onSort: (s: Sorted) => user.patch('TableView', name, { sort: { column: s.id, descending: s.desc ?? false } }),
    onResize: (id: string, width: string | undefined) => user.patch('TableView', name, { widths: { [id]: width === undefined ? undefined : Number.parseFloat(width) } }),
    onReorder: (ids: string[]) => user.patch('TableView', name, { columns: ids }),
  };
}
