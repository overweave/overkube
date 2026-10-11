import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { Column, PENDING, slots, TableView, takes } from '@overkube/sdk';
import { useCollection, usePage } from '@overkube/sdk/preact';
import { Button, Notice, Skeleton, Table, type TableColumn } from '@overkube/uikit';
import { inOrder } from '@overweave/ui';
import { Guarded, slotElement, useDefinition, useDefinitions } from '@overweave/ui/preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useWaited } from './waited.ts';

/**
 * A kind's objects as a table, all of it from the definitions: the Columns
 * whose target takes the kind, set out as its TableView says (order,
 * hidden, widths, sort, which objects); over it, the kind.bar slot, given
 * the list. A column's value that throws is its owner's failure (no value
 * in that cell) — told once a drawing, not once a cell (the page tells
 * whose it is); its render is drawn
 * apart (Guarded, tried again when its object changes), the rest of the
 * table goes on. On their way, the rows wait in the table as it will be (its
 * columns, as set out: no shift once they come); a cell whose value is not
 * there yet (PENDING) waits on its own. A kind no Column takes has no table. Objects the page can
 * no longer keep current (stale) stay shown, said to be so.
 */
export function KindTable({ kind }: { kind: KindInfo }) {
  const page = usePage();
  // The page waited for this kind already (the last one shown meanwhile): its placeholders at once.
  const waited = useWaited();
  const collection = useCollection(kind);
  // Said to those who cannot see it, once it is there to be read out (a region's first words are often not): loading, then how many.
  const [said, setSaid] = useState('');
  const loadingNow = collection.state.value === 'loading';
  const count = collection.items.value.size;
  useEffect(() => setSaid(loadingNow ? `Loading ${kind.plural}…` : `${count} ${kind.plural}`), [loadingNow]);
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
        return {
          id: c.name,
          header: c.spec.header,
          width: width === undefined ? undefined : `${width}px`,
          // Not there yet (PENDING): none to sort by — last.
          sort: (o) => {
            const v = value(o)?.value;
            return typeof v === 'number' || typeof v === 'string' ? v : undefined;
          },
          cell: (o) => {
            const got = value(o);
            if (got?.value === PENDING)
              return (
                <>
                  <Skeleton width="60%" />
                  <span class="uk-sr-only">Loading</span>
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
          },
        };
      }),
    [placed, view.widths, kind, failed],
  );

  if (placed.length === 0) return <Notice icon="grid">No columns for {kind.id}: no addon defines any.</Notice>;

  const state = collection.state.value;
  const error = collection.error.value;
  const initialSort = view.sort ? { id: view.sort.column, desc: view.sort.descending } : undefined;
  if (state === 'absent') return <Notice icon="puzzle">The cluster does not serve {kind.id}.</Notice>;
  if (state === 'error')
    return (
      <Notice
        level="error"
        icon="warning"
        action={
          <Button variant="ghost" size="sm" icon="refresh" onClick={() => collection.retry()}>
            Try again
          </Button>
        }
      >
        <span title={error?.message}>
          {kind.plural} cannot be had: {error?.code}
        </span>
      </Notice>
    );

  const loading = state === 'loading';
  const items = loading ? [] : [...collection.items.value.values()];
  // Which objects: as the TableView's filter says (an object it throws on is shown, the failure its owner's).
  const filter = view.filter;
  const rows = filter
    ? items.filter((o) => {
        try {
          return filter(o);
        } catch (error) {
          failed('TableView', kind.id, 'filter', error);
          return true;
        }
      })
    : items;

  // One tree, loading or not: the table stays the same table — its placeholders give way to its rows in place.
  return (
    <div class="uk-region">
      {loading && error && (
        <Notice level="warn" icon="refresh">
          <span title={error.message}>Waiting: {error.message}</span>
        </Notice>
      )}
      {state === 'stale' && (
        <Notice level="warn" icon="refresh">
          <span title={error?.message}>Not current: the page has lost the cluster's changes and is reconnecting. What is shown is as it was.</span>
        </Notice>
      )}
      <span class="uk-sr-only" role="status">
        {said}
      </span>
      {slotElement(slots.kind.bar, { kind, list: { shown: rows.length, total: items.length, state, error } })}
      <Table
        rows={rows}
        columns={columns}
        rowKey={rowKey}
        loading={loading}
        placeholdersAfter={waited ? 0 : undefined}
        empty={rows.length < items.length ? `No ${kind.plural} shown of ${items.length}` : `No ${kind.plural}`}
        initialSort={initialSort}
      />
    </div>
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
