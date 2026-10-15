import type { KindInfo } from '@overkube/kube-types';
import type { FieldCatalog } from '@overkube/query';
import type { CellProps, CellValue, ColumnContext, ColumnSpec, Say } from '@overkube/sdk';
import { useSay } from '@overkube/sdk/preact';
import type { Definition } from '@overweave/core';
import { Guarded, Wrapped } from '@overweave/ui/preact';
import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import type { Failed } from './failures.ts';
import { EMPTY, formatted } from './format.ts';
import { clock, useLive } from './live.ts';

/*
 * A cell of a column (a table's, a summary's): its format of its values —
 * none of its own, as their fields' definitions say them; nothing, "—" —
 * live: worked out again as now changes (if it reads it), drawn again only
 * as it changes; in the Wraps of its column's name (each kept apart: one
 * that throws, what it wraps drawn instead), given its kind, its values and
 * its text. A format that throws, or draws something that throws: its
 * column's failure, "—" (or nothing drawn) in its place — drawn again once
 * its values change.
 */

/** What a column draws of its values, now: its format's, or as their fields' types say them; a format that throws, "—" (told as its column's). */
export function drawn(
  column: Definition<ColumnSpec>,
  fields: readonly string[],
  values: readonly CellValue[],
  context: ColumnContext,
  catalog: FieldCatalog | undefined,
  failed: Failed,
): ComponentChildren {
  try {
    return column.spec.format ? column.spec.format(values, context) : plain(fields, values, context, catalog);
  } catch (error) {
    failed(column, 'Column', column.name, 'format', error);
    return EMPTY;
  }
}

/** Values as text, as their fields' types say them (a column with no format of its own; what a cell drawn otherwise says). */
export function plain(fields: readonly string[], values: readonly CellValue[], context: ColumnContext, catalog: FieldCatalog | undefined): string {
  // The clock read only for a time (the rest not drawn again each second).
  const now = fields.some((f) => catalog?.fields[f]?.type === 'time') ? context.now : 0;
  return fields.map((f, i) => formatted(values[i], catalog?.fields[f], now)).join(' ');
}

/** What is drawn as text: nothing, "—"; a text or a number as it is; anything else, none (it draws more than text). */
export function textOf(d: ComponentChildren): string | undefined {
  if (d === null || d === undefined || d === '' || d === false) return EMPTY;
  return typeof d === 'string' || typeof d === 'number' ? String(d) : undefined;
}

/** The context a column's format is given: now (live: the clock), its kind, how to say things. */
export const contextOf = (kind: KindInfo, say: Say): ColumnContext => ({
  get now() {
    return clock.value;
  },
  kind,
  say,
});

export function Cell({
  column,
  fields,
  values,
  kind,
  catalog,
  failed,
}: {
  column: Definition<ColumnSpec>;
  fields: readonly string[];
  values: readonly CellValue[];
  kind: KindInfo;
  catalog: FieldCatalog | undefined;
  failed: Failed;
}) {
  const say = useSay();
  const [d, said] = useLive(() => {
    const context = contextOf(kind, say);
    const d = drawn(column, fields, values, context, catalog, failed);
    // Drawn as more than text (a state, a link): its values as text, for what wraps it.
    return [d, textOf(d) ?? plain(fields, values, context, catalog)] as const;
  }, [column, fields, values, kind, catalog, say, failed]);
  const text = textOf(d);
  const props = useMemo<CellProps>(() => ({ kind, values, display: said }), [kind, values, said]);
  return (
    <Wrapped name={column.name} props={props}>
      {text !== undefined ? (
        text
      ) : (
        // Drawn apart: what it draws failing is its column's; tried again when its values change.
        <Guarded key={JSON.stringify(values)} definition={column}>
          {d}
        </Guarded>
      )}
    </Wrapped>
  );
}
