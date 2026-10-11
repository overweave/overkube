import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { objectPathOf, type RouteProps, slots } from '@overkube/sdk';
import { useCluster, useKind, usePage } from '@overkube/sdk/preact';
import { Button, Notice } from '@overkube/uikit';
import { slotElement } from '@overweave/ui/preact';
import { useEffect } from 'preact/hooks';
import { KindTable } from './KindTable.tsx';
import { useNav } from './nav.ts';

/**
 * A kind's page (/k/<kind>, and /k/<kind>/<namespace>/<name> or
 * /k/<kind>/<name>: one of its objects over it) — one route, so opening an
 * object leaves the table as it was (its sort, its scroll, its watch). What
 * is drawn is the slots': kind.page (the core's table, or another's in its
 * place for some kinds) and object.view (the core's modal, or another's).
 * A kind not served is said so; what discovery cannot have, said, with a
 * way to try again.
 */
export function KindPage({ params, rest }: RouteProps) {
  const discovery = useCluster().discovery;
  const kind = useKind(params.kind);
  if (!kind) {
    const error = discovery.error.value;
    if (!discovery.kinds.value && discovery.state.value === 'error' && error)
      return (
        <Notice
          level="error"
          icon="warning"
          action={
            <Button variant="ghost" size="sm" icon="refresh" onClick={() => discovery.retry()}>
              Try again
            </Button>
          }
        >
          <span title={error.message}>What the cluster serves cannot be had: {error.code}</span>
        </Notice>
      );
    if (!discovery.kinds.value) return <Notice loading>Asking the cluster what it serves…</Notice>;
    return <Notice icon="puzzle">The cluster serves no kind {params.kind}.</Notice>;
  }
  const object = objectOf(kind, rest);
  return (
    <>
      {slotElement(slots.kind.page, { kind }, { limit: 1 })}
      {object && slotElement(slots.object.view, { kind, ...object }, { limit: 1 })}
    </>
  );
}

/** The object a page's rest names: /<namespace>/<name> (a namespaced kind's), /<name>. */
function objectOf(kind: KindInfo, rest: string): { namespace?: string; name: string } | undefined {
  const parts = rest.split('/').filter(Boolean);
  if (kind.namespaced ? parts.length !== 2 : parts.length !== 1) return undefined;
  try {
    const [a, b] = parts.map(decodeURIComponent);
    return kind.namespaced ? { namespace: a, name: b } : { name: a };
  } catch {
    return undefined;
  }
}

/** The core's kind page: its table (a new kind, a new table — nothing of the last one's carried over). */
export function TablePage({ kind }: { kind: KindInfo }) {
  return <KindTable key={kind.id} kind={kind} />;
}

/** An object's name, as a link to it. */
export function NameCell({ object, kind, value }: { object: KubeObject; kind: Parameters<typeof objectPathOf>[0]; value: unknown }) {
  const page = usePage();
  return <a href={page.href(objectPathOf(kind, object))}>{String(value ?? '')}</a>;
}

/** The start (/): the first pinned kind's table. */
export function Home() {
  const nav = useNav();
  const page = usePage();
  const first = nav.pinned[0] ?? nav.groups[0]?.entries[0];
  useEffect(() => {
    if (first) page.navigate(first.path, { replace: true });
  }, [first?.path]);
  return first ? null : <Notice loading>Asking the cluster what it serves…</Notice>;
}
