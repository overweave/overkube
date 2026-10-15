import type { KindInfo, KubeObject } from '@overkube/kube-types';
import type { Item, ListResult, Where } from '@overkube/query';
import { type CellValue, type KindTableProps, KindView, kindRef, type ListState, slots, TableView } from '@overkube/sdk';
import { useCluster, useCount, useList, useMenu, useSay, useUser } from '@overkube/sdk/preact';
import { EmptyState, Nothing, Notice, Table, type TableColumn, type TableSort, Tip } from '@overkube/uikit';
import { slotElement, useDefinition } from '@overweave/ui/preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Cell } from './cell.tsx';
import { useColumns } from './columns.tsx';
import { fieldOf, useFailures } from './failures.ts';
import { type Chosen, scopeOf } from './namespaces.tsx';
import { T } from './texts.ts';
import { useWaited } from './waited.ts';

/**
 * A kind's objects as a table — the core's kind.table, drawn wherever an
 * SDK <KindTable> is (unless another's takes its place) — of a query: the
 * kind, in the table's scope, those its TableView's where and the table's
 * own take, sorted by a column's field (the TableView's sort, then the
 * user's; none: by name), the window of them in view, the fields its
 * columns are made of. It holds no objects: the rows in view, their
 * values. Its columns as useColumns sets them out; a cell, its column's
 * format of its values (Cell). Over it, its title (if given) and its
 * toolbar (kind.table.toolbar, given the list); in a column's header,
 * kind.table.column.content; no rows, kind.table.empty; a row's menu, the
 * resource's (resource.context: the object, whole, as the cluster has it).
 * Another window of the same query on its way, the last one's rows stay
 * shown; not all of it there (behind, some namespaces refused), said so; a
 * field that cannot be worked out of some objects, its owner's failure.
 */

/** Rows asked for at first, before the table says which are in view. */
const FIRST = 50;

/** A where of all of these (none: none). */
const allOf = (...wheres: (Where | undefined)[]): Where | undefined => {
  const given = wheres.filter((w): w is Where => w !== undefined);
  return given.length < 2 ? given[0] : { op: 'and', args: given };
};

/** An object as its row knows it — its kind, namespace, name, uid: what a menu has of it, the object itself not had. */
const objectOf = (kind: KindInfo, key: string, uid: string | undefined): KubeObject => {
  const at = kind.namespaced ? key.indexOf('/') : -1;
  const metadata = at < 0 ? { name: key, uid } : { namespace: key.slice(0, at), name: key.slice(at + 1), uid };
  return { apiVersion: kind.group ? `${kind.group}/${kind.version}` : kind.version, kind: kind.kind, metadata };
};

/** Every column there is in a new order of those shown (moved among them): those not shown (a wide one, the namespace in one) kept in their places. */
export function orderOf(all: readonly string[], shown: readonly string[]): string[] {
  let next = 0;
  return all.map((name) => (shown.includes(name) ? (shown[next++] as string) : name));
}

export function CoreTable({ chosen, ...table }: KindTableProps & { chosen: Chosen }) {
  const { kind, title } = table;
  // Its own scope, else the namespaces chosen in the page's header.
  const scope = scopeOf(kind, table.scope, chosen.value);
  const ref = kindRef(kind);
  // The page waited for this kind already (the last one shown meanwhile): its placeholders at once.
  const waited = useWaited();
  const say = useSay();
  const menu = useMenu('resource.context');
  const failed = useFailures();
  // The kind's own table (its page's): its TableView whole. Another's frame's (plain: a workload's pods): which columns are shown and which
  // objects (hidden, where) — not the widths, order or sort made for the kind's own page.
  const own = !table.plain;
  const given = useDefinition(TableView, kind.id)?.spec ?? {};
  const view = own ? given : { ...(given.hidden ? { hidden: given.hidden } : {}), ...(given.where ? { where: given.where } : {}) };
  const columned = useColumns(kind, view, failed);
  const { catalog } = columned;
  // In one namespace only: its namespace not said on every row.
  const one = typeof scope === 'object' && scope.namespaces.length === 1;
  const placed = useMemo(() => (one ? columned.placed.filter((c) => c.definition.name !== 'core.namespace') : columned.placed), [columned.placed, one]);

  const [range, setRange] = useState({ first: 0, last: FIRST });
  // The kind's own table (its page's): what the user does to it — a sort, a column's width or place — theirs, kept (its TableView's, patched).
  // Another's frame's (plain: a workload's pods): for the while it is drawn only — the kind's table not changed from there.
  const user = useUser();
  const [asked, setAsked] = useState<TableSort>();
  const setSort = (s: TableSort) => (own ? user.patch('TableView', kind.id, { sort: { column: s.id, descending: s.desc ?? false } }) : setAsked(s));
  const setWidth = (id: string, width: string | undefined) => user.patch('TableView', kind.id, { widths: { [id]: width === undefined ? undefined : Number.parseFloat(width) } });
  const setOrder = (ids: string[]) =>
    user.patch('TableView', kind.id, {
      columns: orderOf(
        columned.offered.map((o) => o.definition.name),
        ids,
      ),
    });
  // A sort by a column there is, that sorts (one by another: none); asked here, else its TableView's (the user's among it), else by name.
  const sorting = (s: TableSort | undefined) => (s && placed.some((c) => c.definition.name === s.id && c.definition.spec.sort) ? s : undefined);
  const sort = sorting(asked) ?? sorting(view.sort && { id: view.sort.column, desc: view.sort.descending }) ?? sorting({ id: 'core.name' });
  const sortBy = placed.find((c) => c.definition.name === sort?.id)?.definition.spec.sort;
  const where = allOf(view.where, table.where);
  const select = useMemo(() => [...new Set(placed.flatMap((c) => c.fields))], [placed]);
  const asking = {
    kind: ref,
    ...(scope ? { scope } : {}),
    ...(where ? { where } : {}),
    ...(sortBy ? { sort: [{ field: sortBy, desc: sort?.desc ?? false }] } : {}),
  };
  const answer = useList({ ...asking, page: { offset: range.first, limit: Math.max(1, range.last - range.first) }, select });
  // Another window of the same query (scrolled) on its way: the last one's rows shown till it is in — no flash of placeholders. Of
  // another query (another kind, scope, where, sort): none of the last one's kept.
  const same = JSON.stringify(asking);
  const last = useRef<{ answer: ListResult; offset: number; same: string } | null>(null);
  const settled = answer.state !== 'loading' || answer.items.length > 0;
  if (settled) last.current = { answer, offset: range.first, same };
  const kept = !settled && last.current?.same === same ? last.current : null;
  // How many there are of those the table may show (its where aside: "none shown of 12").
  const all = useCount({ kind: ref, ...(scope ? { scope } : {}) });

  const result = kept?.answer ?? answer;
  const offset = kept?.offset ?? range.first;
  const state = result.state;
  const error = result.error;
  // Its rows not in yet, or its fields' definitions (how a time is shown): placeholders.
  const loading = (state === 'loading' && result.items.length === 0) || !catalog;
  // A field that could not be worked out of some objects: its owner's failure (its cells: "—").
  for (const [name, e] of Object.entries(result.fieldErrors ?? {})) failed(fieldOf(name), 'Field', name, 'value', new Error(`${e.code}: ${e.message} (${e.count} objects)`));
  const count = result.total?.count;
  // Said to those who cannot see it, once it is there to be read out (a region's first words are often not): loading, then how many.
  const [said, setSaid] = useState('');
  useEffect(
    () => setSaid(loading ? say(T.kind.table.loading, { kind: kind.plural }) : say(T.kind.table.count, { count: count ?? 0, kind: kind.plural })),
    [loading, count, kind.plural, say],
  );

  // A row's values for a column: the same array while the row is the same (its cell not worked out again for another's change).
  const cached = useMemo(() => new WeakMap<Item, Map<string, readonly CellValue[]>>(), [placed]);
  const valuesOf = (item: Item, name: string, fields: readonly string[]) => {
    let row = cached.get(item);
    if (!row) {
      row = new Map();
      cached.set(item, row);
    }
    let values = row.get(name);
    if (!values) {
      values = fields.map((f) => (item.values?.[f] ?? null) as CellValue);
      row.set(name, values);
    }
    return values;
  };
  // The object a row is, as its menu is given it: the whole of it, as the cluster has it now (the same uid), else as the row knows it.
  const cluster = useCluster();
  const objectFor = (item: Item): KubeObject => {
    const known = objectOf(kind, item.key, item.uid);
    const got = cluster.source.get<KubeObject>({ kind: ref, ...(known.metadata?.namespace ? { namespace: known.metadata.namespace } : {}), name: known.metadata?.name ?? '' });
    const off = got.subscribe(() => {});
    const object = got.value.object;
    off();
    return object && object.metadata?.uid === item.uid ? object : known;
  };

  const columns = useMemo(
    () =>
      placed.map(({ definition: c, fields }): TableColumn<(typeof result.items)[number]> => {
        const header = say(c.spec.header);
        const width = view.widths?.[c.name] ?? c.spec.width;
        return {
          id: c.name,
          label: header,
          header: slotElement(slots.kind.table.column.content, { kind, column: { name: c.name, header } }),
          width: width === undefined ? undefined : `${width}px`,
          sortable: c.spec.sort !== undefined,
          cell: (item) => <Cell column={c} fields={fields} values={valuesOf(item, c.name, fields)} kind={kind} catalog={catalog} failed={failed} />,
        };
      }),
    [placed, view.widths, kind, catalog, failed, say],
  );

  if (placed.length === 0) return <Notice icon="grid">{say(T.kind.table.noColumns, { kind: kind.id })}</Notice>;
  if (state === 'error' && error?.code === 'not_served') return <Notice icon="puzzle">{say(T.kind.notServed, { kind: kind.id })}</Notice>;
  if (state === 'error' || state === 'denied')
    return (
      <Notice level="error" icon="warning">
        <Tip content={() => error?.message}>{say(T.kind.refused, { kind: kind.plural, code: error?.code ?? '' })}</Tip>
      </Notice>
    );

  const list: ListState = { state, ...(count === undefined ? {} : { shown: count }), ...(all.total ? { total: all.total.count } : {}), ...(error ? { error } : {}) };
  // In another's frame, none: its empty state alone, no table's head over nothing.
  if (table.plain && !loading && count === 0) return <div class="uk-region">{slotElement(slots.kind.table.empty, { ...table, list }, { limit: 1 })}</div>;
  // One tree, loading or not: the table stays the same table — its placeholders give way to its rows in place.
  return (
    <div class="uk-region">
      {loading && error && (
        <Notice level="warn" icon="refresh">
          <Tip content={() => error.message}>{say(T.kind.table.waiting, { reason: error.message })}</Tip>
        </Notice>
      )}
      {state === 'stale' && (
        <Notice level="warn" icon="refresh">
          <Tip content={() => error?.message}>{say(T.kind.table.stale)}</Tip>
        </Notice>
      )}
      {state === 'partial' && (
        <Notice level="warn" icon="shield">
          {say(T.kind.table.partial, { namespaces: result.coverage.denied.join(', ') })}
        </Notice>
      )}
      {title && <h2 class="uk-region-title">{say(title)}</h2>}
      <span class="uk-sr-only" role="status">
        {said}
      </span>
      {slotElement(slots.kind.table.toolbar, { ...table, list })}
      <Table
        rows={result.items}
        offset={offset}
        {...(count === undefined ? {} : { total: count })}
        onRange={(first, last) => setRange((r) => (r.first === first && r.last === last ? r : { first, last }))}
        sort={sort}
        onSort={setSort}
        {...(own ? { onResize: setWidth, onReorder: setOrder } : {})}
        columns={columns}
        rowKey={(item) => item.key}
        plain={table.plain}
        loading={loading}
        placeholdersAfter={waited ? 0 : undefined}
        empty={slotElement(slots.kind.table.empty, { ...table, list }, { limit: 1 })}
        onRowMenu={(item, e) => menu({ kind, object: objectFor(item) }, e, `${kind.kind} ${item.key}`)}
      />
    </div>
  );
}

/** No rows (the core's, kind.table.empty's last): none at all, or none shown of those there are; in another's frame, a word that there are none. */
export function TableEmpty({ kind, scope, list, chosen, plain }: KindTableProps & { list: ListState; chosen: Chosen }) {
  const say = useSay();
  const icon = useDefinition(KindView, kind.id)?.spec.icon ?? 'cube';
  // In another's frame (a resource's section): a word, not a page's empty state — what it picks is its own, not the page's.
  if (plain) return <Nothing icon={icon}>{say(T.kind.table.none, { kind: kind.plural })}</Nothing>;
  const total = list.total ?? 0;
  if ((list.shown ?? 0) < total)
    return (
      <EmptyState icon={icon} title={say(T.kind.table.noneShown, { kind: kind.plural, total })}>
        {say(T.kind.table.filtered)}
      </EmptyState>
    );
  // None in the namespaces chosen in the page's header (not its own scope): all of them a click away.
  const names = !scope && kind.namespaced ? chosen.value : [];
  return (
    <EmptyState
      icon={icon}
      title={say(T.kind.table.none, { kind: kind.plural })}
      action={names.length ? { label: say(T.kind.table.showAll), run: () => (chosen.value = []) } : undefined}
    >
      {names.length ? say(T.kind.table.noneIn, { names: names.join(', ') }) : say(T.kind.table.noneYet)}
    </EmptyState>
  );
}
