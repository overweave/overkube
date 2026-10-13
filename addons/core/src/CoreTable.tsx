import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { Column, type ColumnContext, type ColumnSpec, type KindTableProps, type ListState, PENDING, slots, TableView, takes } from '@overkube/sdk';
import { useCollection, useMenu, useSay } from '@overkube/sdk/preact';
import { Button, Notice, Skeleton, Table, type TableColumn } from '@overkube/uikit';
import type { Definition } from '@overweave/core';
import { inOrder } from '@overweave/ui';
import { Guarded, slotElement, useDefinition, useDefinitions, Wrapped } from '@overweave/ui/preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useFailures } from './failures.ts';
import { clock, useLive } from './live.ts';
import { T } from './texts.ts';
import { useWaited } from './waited.ts';

/**
 * A kind's objects as a table — the core's kind.table, drawn wherever an
 * SDK <KindTable> is (unless another's takes its place) — all of it from
 * the definitions: the Columns whose target (and when) takes the kind, set
 * out as its TableView says (order, hidden — none said: as the column is —, widths, sort, which objects —
 * and of those, the ones the table's own filter takes). Sorted by a
 * column's value (the TableView's sort; none: by name, Name shown so),
 * those of the same value by their place (namespace/name); a cell its display (one that reads now: drawn again as
 * it changes, where its text does), or its render. Over it, its title (if
 * given) and its toolbar (kind.table.toolbar, given the list); in a
 * column's header, kind.table.column.content; a cell in the Wraps of its
 * column's name; no rows, kind.table.empty; a row's menu, the resource's
 * (resource.context). A column's value or display that throws is its
 * owner's failure (nothing in that cell: "—"), told once while it is as it
 * is, not once a cell nor once a tick; its
 * render is drawn apart (Guarded, tried again when its object changes),
 * the rest of the table goes on. On their way, the rows wait in the table
 * as it will be (its columns, as set out: no shift once they come); a cell
 * whose value is not there yet (PENDING) waits on its own. A kind no
 * Column takes has no table. Objects the page can no longer keep current
 * (stale) stay shown, said to be so.
 */
export function CoreTable(table: KindTableProps) {
  const { kind, title } = table;
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
  // What failed while drawn, told once as its owner's (useFailures).
  const failed = useFailures();

  const view = useDefinition(TableView, kind.id)?.spec ?? {};
  // Of those its target takes, those its when does (one that throws: not drawn, its failure told).
  const all = useDefinitions(Column).filter((c) => {
    if (!takes(c.spec.target, kind)) return false;
    try {
      return c.spec.when?.(kind) ?? true;
    } catch (error) {
      failed(c, 'Column', c.name, 'when', error);
      return false;
    }
  });
  const placed = useMemo(() => {
    // Hidden as the view says, else as the column is (for this kind, if it says so by kind: one that throws, shown — its failure told).
    const hidden = (c: (typeof all)[number]) => {
      const h = view.hidden?.[c.name] ?? c.spec.hidden;
      if (typeof h !== 'function') return !!h;
      try {
        return h(kind);
      } catch (error) {
        failed(c, 'Column', c.name, 'hidden', error);
        return false;
      }
    };
    return arranged(all, view).filter((c) => !hidden(c));
    // Definitions are new objects only when they change: the same ones, the same columns.
  }, [view.columns, view.hidden, kind, failed, ...all]);

  // What a column's value and display are worked out with: now as it is (a sort does not follow the clock), or — in a cell's text — as
  // it ticks (that text drawn again only where it changes); every object of the kind listed (set below, as they come).
  const listed = useRef<readonly KubeObject[]>([]);
  const contexts = useMemo(
    () => ({
      still: {
        get now() {
          return Date.now();
        },
        get objects() {
          return listed.current;
        },
        kind,
      } satisfies ColumnContext,
      live: {
        get now() {
          return clock.value;
        },
        get objects() {
          return listed.current;
        },
        kind,
      } satisfies ColumnContext,
    }),
    [kind],
  );

  const columns = useMemo(
    () =>
      placed.map((c): TableColumn<KubeObject> => {
        const width = view.widths?.[c.name] ?? c.spec.width;
        // Its value, its display: either may throw, the column's failure (no value: sorted last; no display: nothing in the cell).
        const value = (o: KubeObject) => {
          try {
            return { value: c.spec.value(o, contexts.still) };
          } catch (error) {
            failed(c, 'Column', c.name, 'value', error);
            return undefined;
          }
        };
        // Live: worked out again as now changes, if it reads it.
        const display = (o: KubeObject) => {
          try {
            return c.spec.display(o, contexts.live);
          } catch (error) {
            failed(c, 'Column', c.name, 'display', error);
            return '';
          }
        };
        const header = say(c.spec.header);
        return {
          id: c.name,
          label: header,
          header: slotElement(slots.kind.table.column.content, { kind, column: { name: c.name, header } }),
          width: width === undefined ? undefined : `${width}px`,
          // Not there yet (PENDING), or not a thing to sort by: last.
          sort: (o) => {
            const v = value(o)?.value;
            return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' ? v : undefined;
          },
          cell: (o) => <Cell column={c} kind={kind} object={o} objects={listed.current} value={value(o)?.value} display={display} />,
        };
      }),
    [placed, view.widths, kind, failed, say, contexts],
  );

  if (placed.length === 0) return <Notice icon="grid">{say(T.kind.table.noColumns, { kind: kind.id })}</Notice>;

  const state = collection.state.value;
  const error = collection.error.value;
  // Sorted as its TableView says; told nothing, by name (the column shown so: sorted by it, its arrow up) — where there is one.
  const initialSort = view.sort ? { id: view.sort.column, desc: view.sort.descending } : placed.some((c) => c.name === 'core.name') ? { id: 'core.name' } : undefined;
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
  listed.current = items;
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
        failed(f, whose, kind.id, 'filter', error);
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
 * A cell: its column's display of its object (nothing — empty, none,
 * kubectl's <none> —: "—"; a 0 is a 0) — live: worked out again as now changes, if it reads
 * it, drawn again only where its text does —, or its render (given it,
 * drawn apart: Guarded, tried again when its object changes), or waiting
 * (its value not there yet: PENDING); in the Wraps of its column's name
 * (each kept apart: one that throws, what it wraps drawn instead; followed
 * as they come and go), given the same props while its object, value and
 * text are the same — its wraps chosen again only then (a live text's: as
 * it changes, each second at most).
 */
function Cell({
  column,
  kind,
  object,
  objects,
  value,
  display,
}: {
  column: Definition<ColumnSpec>;
  kind: KindInfo;
  object: KubeObject;
  objects: readonly KubeObject[];
  value: unknown;
  display: (object: KubeObject) => string;
}) {
  const say = useSay();
  // Worked out again as its object, the objects listed with it, or now (if it reads it) change.
  const waiting = value === PENDING;
  const text = useLive(() => (waiting ? '' : display(object)), [display, object, objects, waiting]);
  const shown = text;
  const drawn = shownAs(shown);
  const props = useMemo(() => ({ kind, object, value, display: shown }), [kind, object, value, shown]);
  const Render = column.spec.render;
  return (
    <Wrapped name={column.name} props={props}>
      {waiting ? (
        <>
          <Skeleton width="60%" />
          <span class="uk-sr-only">{say(T.kind.table.cellLoading)}</span>
        </>
      ) : Render ? (
        // Tried again when its object changes (a fix in the object, or another under its name).
        <Guarded key={`${object.metadata?.uid}:${object.metadata?.resourceVersion}`} definition={column}>
          <Render {...props} />
        </Guarded>
      ) : (
        drawn
      )}
    </Wrapped>
  );
}

/** A kind's columns as its TableView sets them out: those it names first, in its order; the others after, in theirs. */
export function arranged<C extends { name: string; spec: { order?: number } }>(all: readonly C[], view: { readonly columns?: readonly string[] }): C[] {
  const order = [...new Set(view.columns ?? [])];
  return [...order.map((name) => all.find((c) => c.name === name)).filter((c): c is C => !!c), ...inOrder(all.filter((c) => !order.includes(c.name)))];
}

/** What an empty cell shows. */
export const EMPTY = '—';

/** kubectl's words for nothing there: drawn as nothing ("—"); its others (<pending>, <unknown>) say a state, and stay. */
const NOTHING = new Set(['', '<none>', '<unset>']);

/** A display as drawn: nothing (empty, none, kubectl's <none>) "—"; a 0 a 0 — one that broke its word (JavaScript's: none, a number) as text all the same. */
export function shownAs(display: unknown): string {
  return display === undefined || display === null || NOTHING.has(display as string) ? EMPTY : String(display);
}

/** A row's key: where the object is. */
const rowKey = (o: KubeObject) => `${o.metadata?.namespace ?? ''}/${o.metadata?.name}`;

/** No rows (the core's, kind.table.empty's last): none at all, or none shown of those there are. */
export function TableEmpty({ kind, list }: { kind: KindInfo; list: ListState }) {
  const say = useSay();
  return <>{list.shown < list.total ? say(T.kind.table.noneShown, { kind: kind.plural, total: list.total }) : say(T.kind.table.none, { kind: kind.plural })}</>;
}
