import type { KindInfo } from '@overkube/kube-types';
import { grantsAny, type Live, type Scope } from '@overkube/query';
import { knownNamespaces, Namespaces } from '@overkube/sdk';
import { useCluster, useList, useSay, useUser } from '@overkube/sdk/preact';
import { MultiSelect } from '@overkube/uikit';
import { useDefinition } from '@overweave/ui/preact';
import type { Signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { T } from './texts.ts';

/*
 * The namespaces the page's tables show (none chosen: all): chosen in the
 * page's header, kept while the page runs (the user's layer's, once there
 * is one). Those one may use without listing them (the cluster's list
 * refused): added there by name, kept as the user's (Namespaces). A table of a namespaced kind shows those, unless it is given a
 * scope of its own; a kind of the whole cluster, all of it. What else reads
 * them chooses to (the start's parts, some of them).
 */

/** The namespaces chosen (none: all). */
export type Chosen = Signal<readonly string[]>;

/** A table's scope: its own, else (a namespaced kind) the namespaces chosen; none: all. */
export const scopeOf = (kind: KindInfo, own: Scope | undefined, chosen: readonly string[]): Scope | undefined =>
  own ?? (kind.namespaced && chosen.length ? { namespaces: chosen } : undefined);

/** A namespace's name: a DNS label. */
const NAME = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

/** A live answer once it is had (followed till then: asked). */
const settled = <T extends { state: string }>(live: Live<T>) =>
  new Promise<T>((done) => {
    const off = live.subscribe((v) => {
      if (v.state === 'loading') return;
      queueMicrotask(() => off());
      done(v);
    });
  });

/**
 * The namespaces to choose (core.header.namespaces): every one the cluster
 * has, by name, and those one may use without listing them (Namespaces) —
 * the cluster's list refused, one added by its name: kept (the user's), if
 * anything is allowed there; else said why not.
 */
export function NamespacePicker({ chosen }: { chosen: Chosen }) {
  const say = useSay();
  const cluster = useCluster();
  const user = useUser();
  const list = useList({ kind: 'namespaces.v1', sort: [{ field: 'core.name' }], page: { offset: 0, limit: 1000 }, select: ['core.name'] });
  const known = knownNamespaces(useDefinition(Namespaces, 'default')?.spec);
  const [problem, setProblem] = useState<string | null>(null);
  const refused = list.state === 'denied' || (list.state === 'error' && list.error?.status === 403);
  // Those one uses without listing them: only while the list is refused (listed, they are among them — or gone).
  const options = [...new Set([...list.items.map((i) => String(i.values?.['core.name'] ?? i.key)), ...(refused ? known : [])])].sort().map((value) => ({ value }));
  const add = async (name: string) => {
    if (!NAME.test(name)) return setProblem(say(T.namespaces.notAName, { name }));
    if (grantsAny(await settled(cluster.source.access({ namespace: name }))) === false) return setProblem(say(T.namespaces.nothing, { name }));
    setProblem(null);
    user.patch('Namespaces', 'default', { known: { [name]: true } });
    chosen.value = [...new Set([...chosen.value, name])];
  };
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
      {...(refused ? { onAdd: (name: string) => void add(name), addLabel: (name: string) => say(T.namespaces.add, { name }), note: problem ?? say(T.namespaces.unlisted) } : {})}
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
