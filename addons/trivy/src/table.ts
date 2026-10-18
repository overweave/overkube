import { TableView } from '@overkube/sdk';
import { useUser } from '@overkube/sdk/preact';
import type { TableColumn, TableSort } from '@overkube/uikit';
import { useDefinition } from '@overweave/ui/preact';

/*
 * A table of the addon's own (not a kind's), set out as the user sets it
 * and kept, as the core's are: its own TableView (named for itself) — its
 * columns' order, widths, how it is sorted (none: as it is given).
 */
export function useTableView<T>(name: string, columns: readonly TableColumn<T>[]) {
  const user = useUser();
  const view = useDefinition(TableView, name)?.spec ?? {};
  const order = view.columns ?? [];
  const sort: TableSort | undefined = view.sort ? { id: view.sort.column, desc: view.sort.descending ?? false } : undefined;
  const placed = [...order.flatMap((id) => columns.filter((c) => c.id === id)), ...columns.filter((c) => !order.includes(c.id))].map((c) =>
    view.widths?.[c.id] ? { ...c, width: `${view.widths[c.id]}px` } : c,
  );
  return {
    columns: placed,
    ...(sort ? { sort } : {}),
    onSort: (s: TableSort) => user.patch('TableView', name, { sort: { column: s.id, descending: s.desc ?? false } }),
    onResize: (id: string, width: string | undefined) => user.patch('TableView', name, { widths: { [id]: width === undefined ? undefined : Number.parseFloat(width) } }),
    onReorder: (ids: string[]) => user.patch('TableView', name, { columns: ids }),
  };
}
