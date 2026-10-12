import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { Column, type KindTableProps, type ListState, PENDING, slots, TableView, takes } from '@overkube/sdk';
import { useCollection, useMenu, usePage, useSay } from '@overkube/sdk/preact';
import { Button, Notice, Skeleton, Table, type TableColumn } from '@overkube/uikit';
import { inOrder } from '@overweave/ui';
import { Guarded, slotElement, useDefinition, useDefinitions, Wrapped } from '@overweave/ui/preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { T } from './texts.ts';
import { useWaited } from './waited.ts';

/**
 * A kind's objects as a table — the core's kind.table, drawn wherever an
 * SDK <KindTable> is (unless another's takes its place) — all of it from
 * the definitions: the Columns whose target takes the kind, set out as its
 * TableView says (order, hidden, widths, sort, which objects — and of
 * those, the ones the table's own filter takes). Over it, its title (if
 * given) and its toolbar (kind.table.toolbar, given the list); in a
 * column's header, kind.table.column.content; a cell in the Wraps of its
 * column's name; no rows, kind.table.empty; a row's menu, the resource's
 * (resource.context). A column's value that throws is its owner's failure
 * (no value in that cell), told once a drawing, not once a cell; its
 * render is drawn apart (Guarded, tried again when its object changes),
 * the rest of the table goes on. On their way, the rows wait in the table
 * as it will be (its columns, as set out: no shift once they come); a cell
 * whose value is not there yet (PENDING) waits on its own. A kind no
 * Column takes has no table. Objects the page can no longer keep current
 * (stale) stay shown, said to be so.
 */
export function CoreTable(table: KindTableProps) {
  const { kind, title } = table;
  const page = usePage();
  // The page waited for this kind already (the last one shown meanwhile): its placeholders at once.
  const waited = useWaited();
  const collection = useCollection(kind);
  // Said to those who cannot see it, once it is there to be read out (a region's first words are often not): loading, then how many.
  const [said, setSaid] = useState('');
  const loadingNow = collection.state.value === 'loading';
  const count = collection.items.value.size;
  const say = useSay();
  const menu = useMenu('resource.context');
  useEffect(
    () => setSaid(loadingNow ? say(T.kind.table.loading, { kind: kind.plural }) : say(T.kind.table.count, { count, kind: kind.plural })),
    [loadingNow, count, kind.plural, say],
  );
  const view = useDefinition(TableView, kind.id)?.spec ?? {};
  const all = useDefinitions(Column).filter((c) => takes(c.spec.target, kind));
  const placed = useMemo(() => {
    const order = [...new Set(view.columns ?? [])];
    return [...order.map((name) => all.find((c) => c.name === name)).filter((c): c is (typeof all)[number] => !!c), ...inOrder(all.filter((c) => !order.includes(c.name)))].filter(
      (c) => !view.hidden?.[c.name],
    );
    // Definitions are new objects only when they change: the same ones, the same columns.
  }, [view.columns, view.hidden, ...all]);

  // What failed while drawn (a cell, a sort, the filter), by whose definition: told once the drawing is
  // done (not while drawing: a status written then would draw again), each once.
  const failures = useRef<Map<string, { kind: string; name: string; field: string; error: unknown }> | null>(null);
  const failed = useMemo(
    () => (definitionKind: string, name: string, field: string, error: unknown) => {
      const key = `${definitionKind}/${name}/${field}`;
      if (!failures.current) {
        failures.current = new Map();
        queueMicrotask(() => {
          const told = failures.current;
          failures.current = null;
          for (const f of told?.values() ?? []) page.report({ kind: f.kind, name: f.name }, f.field, f.error);
        });
      }
      if (!failures.current.has(key)) failures.current.set(key, { kind: definitionKind, name, field, error });
    },
    [page],
  );

  const columns = useMemo(
    () =>
      placed.map((c): TableColumn<KubeObject> => {
        const Render = c.spec.render;
        const width = view.widths?.[c.name] ?? c.spec.width;
        // Its value, and the value as text: either may throw (a value JSON cannot say), the column's failure.
        const value = (o: KubeObject) => {
          try {
            return { value: c.spec.value(o) };
          } catch (error) {
            failed('Column', c.name, 'value', error);
            return undefined;
          }
        };
        const header = say(c.spec.header);
        /** What the column itself draws of an object (its render, its value as text, or waiting). */
        const cellOf = (o: KubeObject, got: { value: unknown } | undefined): ComponentChildren => {
          if (got?.value === PENDING)
            return (
              <>
                <Skeleton width="60%" />
                <span class="uk-sr-only">{say(T.kind.table.cellLoading)}</span>
              </>
            );
          if (Render)
            return (
              // Tried again when its object changes (a fix in the object, or another under its name).
              <Guarded key={`${o.metadata?.uid}:${o.metadata?.resourceVersion}`} definition={c}>
                <Render object={o} kind={kind} value={got?.value} />
              </Guarded>
            );
          if (!got) return '';
          try {
            return text(got.value);
          } catch (error) {
            failed('Column', c.name, 'value', error);
            return '';
          }
        };
        return {
          id: c.name,
          label: header,
          header: slotElement(slots.kind.table.column.content, { kind, column: { name: c.name, header } }),
          width: width === undefined ? undefined : `${width}px`,
          // Not there yet (PENDING): none to sort by — last.
          sort: (o) => {
            const v = value(o)?.value;
            return typeof v === 'number' || typeof v === 'string' ? v : undefined;
          },
          cell: (o) => {
            const got = value(o);
            return (
              <Cell column={c.name} kind={kind} object={o} value={got?.value}>
                {cellOf(o, got)}
              </Cell>
            );
          },
        };
      }),
    [placed, view.widths, kind, failed, say],
  );

  if (placed.length === 0) return <Notice icon="grid">{say(T.kind.table.noColumns, { kind: kind.id })}</Notice>;

  const state = collection.state.value;
  const error = collection.error.value;
  const initialSort = view.sort ? { id: view.sort.column, desc: view.sort.descending } : undefined;
  if (state === 'absent') return <Notice icon="puzzle">{say(T.kind.notServed, { kind: kind.id })}</Notice>;
  if (state === 'error')
    return (
      <Notice
        level="error"
        icon="warning"
        action={
          <Button variant="ghost" size="sm" icon="refresh" onClick={() => collection.retry()}>
            {say(T.retry)}
          </Button>
        }
      >
        <span title={error?.message}>{say(T.kind.refused, { kind: kind.plural, code: error?.code ?? '' })}</span>
      </Notice>
    );

  const loading = state === 'loading';
  const items = loading ? [] : [...collection.items.value.values()];
  // Which objects: as the TableView's filter says, and the table's own (drawn by whoever drew this KindTable) — an object either throws on is shown, the failure told as that filter's.
  const filters = [
    [view.filter, 'TableView'],
    [table.filter, 'KindTable'],
  ] as const;
  const rows = items.filter((o) =>
    filters.every(([f, whose]) => {
      if (!f) return true;
      try {
        return f(o);
      } catch (error) {
        failed(whose, kind.id, 'filter', error);
        return true;
      }
    }),
  );

  const list: ListState = { shown: rows.length, total: items.length, state, error };
  // One tree, loading or not: the table stays the same table — its placeholders give way to its rows in place.
  return (
    <div class="uk-region">
      {loading && error && (
        <Notice level="warn" icon="refresh">
          <span title={error.message}>{say(T.kind.table.waiting, { reason: error.message })}</span>
        </Notice>
      )}
      {state === 'stale' && (
        <Notice level="warn" icon="refresh">
          <span title={error?.message}>{say(T.kind.table.stale)}</span>
        </Notice>
      )}
      {title && <h2 class="uk-region-title">{say(title)}</h2>}
      <span class="uk-sr-only" role="status">
        {said}
      </span>
      {slotElement(slots.kind.table.toolbar, { ...table, list })}
      <Table
        rows={rows}
        columns={columns}
        rowKey={rowKey}
        loading={loading}
        placeholdersAfter={waited ? 0 : undefined}
        empty={slotElement(slots.kind.table.empty, { ...table, list }, { limit: 1 })}
        onRowMenu={(o, e) => menu({ kind, object: o }, e, `${kind.kind} ${o.metadata?.namespace ? `${o.metadata.namespace}/` : ''}${o.metadata?.name ?? ''}`)}
        initialSort={initialSort}
      />
    </div>
  );
}

/**
 * A cell in the Wraps of its column's name (each kept apart: one that
 * throws, what it wraps drawn instead; followed as they come and go) — given
 * the same props while its object and value are the same (its wraps not
 * chosen again for nothing).
 */
function Cell({ column, kind, object, value, children }: { column: string; kind: KindInfo; object: KubeObject; value: unknown; children?: ComponentChildren }) {
  const props = useMemo(() => ({ kind, object, value }), [kind, object, value]);
  return (
    <Wrapped name={column} props={props}>
      {children}
    </Wrapped>
  );
}

/** A row's key: where the object is. */
const rowKey = (o: KubeObject) => `${o.metadata?.namespace ?? ''}/${o.metadata?.name}`;

/** A value as text: nothing for none, a list joined. */
function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(text).join(', ');
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** No rows (the core's, kind.table.empty's last): none at all, or none shown of those there are. */
export function TableEmpty({ kind, list }: { kind: KindInfo; list: ListState }) {
  const say = useSay();
  return <>{list.shown < list.total ? say(T.kind.table.noneShown, { kind: kind.plural, total: list.total }) : say(T.kind.table.none, { kind: kind.plural })}</>;
}
