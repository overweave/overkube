import { filteredIn, type KindProps, KindView, kindRef, slots } from '@overkube/sdk';
import { useCount, usePage, useSay } from '@overkube/sdk/preact';
import { Logo, PageHeader } from '@overkube/uikit';
import { slotElement, useDefinition } from '@overweave/ui/preact';
import { titleOf } from './kinds.ts';
import { type Chosen, scopeOf } from './namespaces.tsx';
import { T } from './texts.ts';

/*
 * The core's in the headers: the page's (header.start: its mark and name,
 * header.sub's beside them); a kind's over its table, smaller (kind.header:
 * its title, the line beside it, its actions — each a slot, others' beside
 * the core's).
 */

/** The page's mark and name, what it is about beside them (core.header.brand: header.sub's). */
export function Brand() {
  return (
    <PageHeader mark={<Logo />} sub={slotElement(slots.header.sub, NO_PROPS)}>
      overkube
    </PageHeader>
  );
}

const NO_PROPS = {} as Record<string, never>;

/** A kind's header (core.kind.header): its icon as its KindView says, its parts' slots. */
export function KindHeader(props: KindProps) {
  const view = useDefinition(KindView, props.kind.id)?.spec;
  const header = slots.kind.header;
  return (
    <PageHeader level={2} icon={view?.icon} sub={slotElement(header.sub, props)} end={slotElement(header.actions, props)}>
      {slotElement(header.title, props)}
    </PageHeader>
  );
}

/** A kind's name, as its KindView says it (core.kind.header.title). */
export function KindTitle({ kind }: KindProps) {
  const title = useDefinition(KindView, kind.id)?.spec.title;
  const say = useSay();
  return <>{title ? say(title) : titleOf(kind)}</>;
}

/** Its group and version (core.kind.header.api): apps/v1, v1. */
export function KindApi({ kind }: KindProps) {
  return <span>{kind.group ? `${kind.group}/${kind.version}` : kind.version}</span>;
}

/** How many there are in the namespaces chosen, once known — of them, filtered (the page's filter), how many it holds (core.kind.header.count). */
export function KindCount({ kind, chosen }: KindProps & { chosen: Chosen }) {
  const scope = scopeOf(kind, undefined, chosen.value);
  const filter = filteredIn(usePage().path.value);
  const total = useCount({ kind: kindRef(kind), ...(scope ? { scope } : {}) }).total;
  const held = useCount({ kind: kindRef(kind), ...(scope ? { scope } : {}), ...(filter ? { filter } : {}) }).total;
  const say = useSay();
  if (!total) return null;
  const count = (t: NonNullable<typeof total>) => `${t.exact ? '' : '~'}${t.count}`;
  if (filter && held) return <span>{say(T.kind.header.filtered, { count: count(held), total: count(total) })}</span>;
  return <span>{say(T.kind.header.count, { count: count(total) })}</span>;
}
