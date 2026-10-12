import type { KindInfo, KubeObject } from '@overkube/kube-types';
import { closeIn, openedIn, openIn, type PageProps, slots } from '@overkube/sdk';
import { KindTable, useCluster, useCollection, usePage, useSay } from '@overkube/sdk/preact';
import { Button, Notice } from '@overkube/uikit';
import { useSlotView } from '@overweave/ui/preact';
import { useComputed } from '@preact/signals';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useNav } from './nav.ts';
import { T } from './texts.ts';
import { Waiting } from './Waiting.tsx';
import { Waited } from './waited.ts';

/*
 * The core's on its pages: a kind's (page.kind) — its table, among what
 * others put there; the kind not found, why — and the start's (page.home).
 */

/** The core's on a kind's page (core.page.kind.table): its table. */
export function PageTable({ kind }: PageProps) {
  // Something opened over the page as it comes (read, not followed: what opens later does not touch the table).
  const opening = !!openedIn(usePage().path.peek());
  return kind ? <Held next={kind} opening={opening} /> : null;
}

/** The kind a page's path names not found (core.page.kind.missing): discovery on its way, refused (try again), or no such kind served. */
export function KindMissing({ params }: PageProps) {
  const discovery = useCluster().discovery;
  const say = useSay();
  const error = discovery.error.value;
  if (!discovery.kinds.value && discovery.state.value === 'error' && error)
    return (
      <Notice
        level="error"
        icon="warning"
        action={
          <Button variant="ghost" size="sm" icon="refresh" onClick={() => discovery.retry()}>
            {say(T.retry)}
          </Button>
        }
      >
        <span title={error.message}>{say(T.page.kind.missing.refused, { code: error.code })}</span>
      </Notice>
    );
  if (!discovery.kinds.value) return <Waiting label={say(T.page.kind.missing.asking)} />;
  return <Notice icon="puzzle">{say(T.page.kind.missing.noKind, { kind: params.kind })}</Notice>;
}

/** How long the table shows the last kind while the next one's objects come: by then, the next one's placeholders. */
const HOLD_MS = 200;

/**
 * The kind's table shown: the last one's, while the next one's objects are
 * on their way (a moment: they come, the next is shown as it is — no empty
 * table between, no placeholders); too long, the next one's, its
 * placeholders at once. A resource opened as it comes is not held: it is
 * opened over its own kind. A new kind, a new table — nothing of the last
 * one's carried over.
 */
function Held({ next, opening }: { next: KindInfo; opening: boolean }) {
  // Held from now on (its objects asked for while the last kind is still shown).
  const state = useCollection(next).state.value;
  // This going to the next kind (a new one each time it changes: one gone to again waits anew), and whether it ran out.
  const going = useMemo(() => ({ to: next.id }), [next.id]);
  const [late, setLate] = useState<object | null>(null);
  const [shown, setShown] = useState({ kind: next, waited: false });
  const there = shown.kind.id === next.id;
  const ready = there || state !== 'loading' || late === going || opening;
  const kind = ready ? next : shown.kind;
  const waited = there ? shown.waited : late === going;
  useEffect(() => {
    if (ready && !there) setShown({ kind: next, waited });
  }, [ready, there]);
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setLate(going), HOLD_MS);
    return () => clearTimeout(t);
  }, [going, ready]);
  return (
    <Waited.Provider value={waited}>
      <KindTable key={kind.id} kind={kind} />
    </Waited.Provider>
  );
}

/** An object's name, as a link opening it over the page it is on (drawn again when the page goes elsewhere, not as things open over it). */
export function NameCell({ object, kind, value }: { object: KubeObject; kind: Parameters<typeof openIn>[1]; value: unknown }) {
  const page = usePage();
  const here = useComputed(() => closeIn(page.path.value)).value;
  return <a href={page.href(openIn(here, kind, object))}>{String(value ?? '')}</a>;
}

/** The start (core.page.home): the first pinned kind's page — unless another's is on it too: then it is a page of its own, and this nothing. */
export function Home(props: PageProps) {
  const alone = useSlotView(slots.page('home'), props).selected.every((f) => f.name === 'core.page.home');
  return alone ? <ToFirst /> : null;
}

/** To the first pinned kind's page (none yet: on its way). */
function ToFirst() {
  const nav = useNav();
  const page = usePage();
  const say = useSay();
  const first = nav.pinned[0] ?? nav.groups[0]?.entries[0];
  useEffect(() => {
    if (first) page.navigate(first.path, { replace: true });
  }, [first?.path]);
  return first ? null : <Waiting label={say(T.page.home.asking)} />;
}
