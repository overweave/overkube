import { listSignal } from '@overweave/ui/preact';
import { computed, type ReadonlySignal } from '@preact/signals';
import { Field, type FieldSpec } from './kinds.ts';

/*
 * The fields addons define (Field), as whoever answers queries takes them
 * over the kinds' own: one layer of them, by name — a new one whenever
 * they come, go or change (an addon started, stopped, a patch).
 */

/** A layer of fields, as a source takes it (@overkube/cel's Layer). */
export interface FieldLayer {
  fields: Readonly<Record<string, FieldSpec>>;
}

/** The fields defined in a registry, followed. */
export function fieldLayers(registry: Parameters<typeof listSignal>[0]): ReadonlySignal<readonly FieldLayer[]> {
  const defined = listSignal(registry, Field);
  return computed(() => [{ fields: Object.fromEntries(defined.value.map((d) => [d.name, d.spec])) }]);
}
