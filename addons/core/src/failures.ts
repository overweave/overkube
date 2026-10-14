import { usePage } from '@overkube/sdk/preact';
import { useMemo, useRef } from 'preact/hooks';

/** Tells a failure as its owner's: what failed (a definition, a filter), its kind and name, which field, the error. */
export type Failed = (what: object, definitionKind: string, name: string, field: string, error: unknown) => void;

/**
 * What failed while drawn (a cell, a sort, a filter, a field), by whose
 * definition: told once the drawing is done (not while drawing: a status
 * written then would draw again), each once while that definition is as it
 * is (what failed: a definition, a filter — new when it changes; not told
 * again as a live text is worked out each second; told again once another,
 * or a patch, is in its place and fails). Shared by what draws columns: a
 * kind's table, a resource's summary.
 */
export function useFailures(): Failed {
  const page = usePage();
  const failures = useRef<Map<string, { kind: string; name: string; field: string; error: unknown }> | null>(null);
  const told = useRef(new WeakMap<object, Set<string>>());
  return useMemo<Failed>(
    () => (what, definitionKind, name, field, error) => {
      const fields = told.current.get(what) ?? new Set<string>();
      if (fields.has(field)) return;
      told.current.set(what, fields.add(field));
      const key = `${definitionKind}/${name}/${field}`;
      if (!failures.current) {
        failures.current = new Map();
        queueMicrotask(() => {
          const due = failures.current;
          failures.current = null;
          for (const f of due?.values() ?? []) page.report({ kind: f.kind, name: f.name }, f.field, f.error);
        });
      }
      if (!failures.current.has(key)) failures.current.set(key, { kind: definitionKind, name, field, error });
    },
    [page],
  );
}

/** A field (by name) as its failures are told by: one object a name, so each is told once while it is as it is. */
const fields = new Map<string, object>();
export const fieldOf = (name: string): object => {
  let f = fields.get(name);
  if (!f) {
    f = { name };
    fields.set(name, f);
  }
  return f;
};
