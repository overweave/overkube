import type { KindInfo } from '@overkube/kube-types';
import type { Scope } from '@overkube/query';
import { useList, useSay } from '@overkube/sdk/preact';
import { MultiSelect } from '@overkube/uikit';
import type { Signal } from '@preact/signals';
import { T } from './texts.ts';

/*
 * The namespaces the page's tables show (none chosen: all): chosen in the
 * page's header, kept while the page runs (the user's layer's, once there
 * is one). A table of a namespaced kind shows those, unless it is given a
 * scope of its own; a kind of the whole cluster, all of it. What else reads
 * them chooses to (the start's parts, some of them).
 */

/** The namespaces chosen (none: all). */
export type Chosen = Signal<readonly string[]>;

/** A table's scope: its own, else (a namespaced kind) the namespaces chosen; none: all. */
export const scopeOf = (kind: KindInfo, own: Scope | undefined, chosen: readonly string[]): Scope | undefined =>
  own ?? (kind.namespaced && chosen.length ? { namespaces: chosen } : undefined);

/** The namespaces to choose (core.header.namespaces): every one the cluster has, by name. */
export function NamespacePicker({ chosen }: { chosen: Chosen }) {
  const say = useSay();
  const list = useList({ kind: 'namespaces.v1', sort: [{ field: 'core.name' }], page: { offset: 0, limit: 1000 }, select: ['core.name'] });
  const options = list.items.map((i) => ({ value: String(i.values?.['core.name'] ?? i.key) }));
  return (
    <MultiSelect
      icon="folder"
      options={options}
      value={chosen.value}
      onChange={(next) => {
        chosen.value = next;
      }}
      all={say(T.namespaces.all)}
      label={say(T.namespaces.label)}
      search={say(T.namespaces.search)}
    />
  );
}

/** Which namespaces a kind's header says it shows (core.kind.header.namespaces): those chosen, for a namespaced kind. */
export function KindNamespaces({ kind, chosen }: { kind: KindInfo; chosen: Chosen }) {
  const say = useSay();
  const names = chosen.value;
  if (!kind.namespaced || names.length === 0) return null;
  return <span>{names.length <= 2 ? say(T.namespaces.in, { names: names.join(', ') }) : say(T.namespaces.inMany, { count: names.length })}</span>;
}
