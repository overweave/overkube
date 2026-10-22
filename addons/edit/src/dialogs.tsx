import type { KubeObject } from '@overkube/kube-types';
import { type Cluster, kindOfRef, kindRef } from '@overkube/sdk';
import { useGet, usePage, useServedKinds } from '@overkube/sdk/preact';
import { useEffect, useState } from 'preact/hooks';
import { ApplyYaml } from './apply.tsx';
import type { AskedSignal } from './asked.ts';
import { Delete } from './delete.tsx';
import { Drain } from './drain.tsx';
import { EditYaml } from './edit-yaml.tsx';
import { editedIn, editIn } from './links.ts';

/*
 * The dialog the page's path asks for (&edit=, the overlay's: over the
 * page, over the resource view it was asked from), laid out as everything
 * opened is (OpenedView: the user's side panel, window or whole window):
 * its object as it is now — gone, no dialog; or YAML applied (&edit=apply).
 * An action's ask goes into the path (Back closes it); closed, out of it.
 */

export function Dialogs({ asked, cluster }: { asked: AskedSignal; cluster: Cluster }) {
  const page = usePage();
  const { kinds } = useServedKinds();
  const a = asked.value;
  useEffect(() => {
    if (!a) return;
    asked.value = null;
    page.navigate(editIn(page.path.peek(), { what: a.what, ref: kindRef(a.kind), name: a.name, ...(a.namespace ? { namespace: a.namespace } : {}) }));
  }, [a]);
  const asks = editedIn(page.path.value);
  // YAML applied: of no one object.
  const applying = asks?.what === 'apply';
  const edited = asks && asks.what !== 'apply' ? asks : undefined;
  const kind = edited && kindOfRef(kinds, edited.ref);
  const got = useGet<KubeObject>(edited && kind ? { kind: edited.ref, name: edited.name, ...(edited.namespace ? { namespace: edited.namespace } : {}) } : undefined);
  // Drawn a moment after its object is there: over the resource view a link opens with it (that one drawn as its object comes too) —
  // a layer opened later is over one before.
  const there = !!got.object;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!there) return setShown(false);
    const at = setTimeout(() => setShown(true), 30);
    return () => clearTimeout(at);
  }, [there]);
  // Its object gone (deleted elsewhere, or by it): out of the path too.
  const gone = !!edited && !!kind && got.state === 'live' && !got.object;
  useEffect(() => {
    if (gone) page.navigate(editIn(page.path.peek(), undefined), { replace: true });
  }, [gone]);
  // Closed: the path as it was before it was asked (Back does not open it again).
  const close = () => page.navigate(editIn(page.path.peek(), undefined), { replace: true });
  if (applying) return <ApplyYaml cluster={cluster} onClose={close} />;
  if (!edited || !kind || !got.object || !shown) return null;
  // A dialog of its own for each object (another asked for: drawn anew).
  const key = `${edited.what}:${edited.ref}:${edited.namespace ?? ''}/${edited.name}`;
  if (edited.what === 'delete') return <Delete key={key} kind={kind} object={got.object} cluster={cluster} onClose={close} />;
  if (edited.what === 'drain') return <Drain key={key} object={got.object} cluster={cluster} onClose={close} />;
  return <EditYaml key={key} kind={kind} object={got.object} cluster={cluster} onClose={close} />;
}
