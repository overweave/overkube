import type { Client } from '@overkube/client';
import { type KindInfo, kinds } from '@overkube/kube-types';
import { Button, Notice } from '@overkube/uikit';
import type { ReadonlySignal } from '@preact/signals';
import { KindTable } from './KindTable.tsx';
import type { Place } from './place.ts';

/** Every kind the kinds table knows, by id: what an id means before discovery answers. */
const KNOWN = new Map<string, KindInfo>(
  Object.values(kinds)
    .flatMap((versions) => Object.values(versions).flatMap((byKind) => Object.values(byKind as Record<string, KindInfo>)))
    .map((k) => [k.id, k]),
);

/**
 * The page: the kind the place names, as its table. Nothing around it yet —
 * what leads from one kind to another (a menu, tabs) is for addons to draw.
 */
export function App({ client, place }: { client: Client; place: ReadonlySignal<Place> }) {
  const id = place.value.kind;
  const served = client.discovery.kinds.value;
  const kind = served?.get(id) ?? KNOWN.get(id);
  if (!kind) {
    if (served) return <Notice icon="puzzle">The cluster serves no kind {id}.</Notice>;
    // Discovery failed (and does not try again by itself: a 403, an old Kubernetes): said, with a way to try again.
    const error = client.discovery.error.value;
    if (client.discovery.state.value === 'error' && error)
      return (
        <Notice
          level="error"
          icon="warning"
          action={
            <Button variant="ghost" size="sm" icon="refresh" onClick={() => void client.discovery.load()}>
              Try again
            </Button>
          }
        >
          <span title={error.message}>What the cluster serves cannot be had: {error.code}</span>
        </Notice>
      );
    return <Notice loading>Asking the cluster what it serves…</Notice>;
  }
  // A new kind, a new table: nothing of the last one's (its sort, its scroll) carried over.
  return <KindTable key={kind.id} kind={kind} />;
}
