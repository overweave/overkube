import type { KindInfo } from '@overkube/kube-types';
import { forKinds, type KubeContributor, kindRef, type ResourceProps, section, slots } from '@overkube/sdk';
import { fill, KindTable, ObjectRef, StatusOf, useList, useSay, useServedKinds } from '@overkube/sdk/preact';
import { Badge, Nothing, Notice, Section, Status, Table } from '@overkube/uikit';
import { useEffect, useState } from 'preact/hooks';
import { APPLIERS, byName, F, Kustomization, own, ref, SOURCES, STATE, sourceRefOf, USERS } from './kinds.ts';
import { ago, FluxState, stateOf, text } from './state.tsx';
import { T } from './texts.ts';

/*
 * A Flux object opened (the resource view, as any is): a Kustomization's,
 * a HelmRelease's source as it is now — its state, its artifact; failing,
 * that its last artifact is still served (no newer revision applied till
 * it is fetched). A source's: what uses it, their own tables (those naming
 * it). A Kustomization's Inventory: each object it applied (Flux's ids:
 * namespace_name_group_Kind), as it is now.
 */

function SourceOf({ object }: ResourceProps) {
  const say = useSay();
  const r = sourceRefOf(object);
  const k = r && byName(r.kind);
  const namespace = r?.namespace ?? object.metadata?.namespace ?? '';
  const got = useList(
    k && r
      ? { kind: ref(k), scope: { namespaces: [namespace] }, where: { field: 'core.name', op: 'eq', value: r.name }, page: { limit: 1 }, select: [...STATE, F.artifact, F.fetched] }
      : undefined,
  );
  if (!r || !k) return null;
  const v = got.items[0]?.values ?? {};
  const state = stateOf(STATE.map((f) => v[f]));
  const artifact = text(v[F.artifact]);
  return (
    <Section title={say(T.source.title)} part="source">
      <div class="uk-stack">
        <span class="uk-line">
          <ObjectRef kind={k.id} name={r.name} namespace={namespace} />
          {got.items[0] && <FluxState {...state} />}
          {artifact && <span class="uk-mono uk-quiet">{artifact}</span>}
        </span>
        {state.ready === 'False' && !state.suspended && (
          <Notice level="warn" icon="warning" title={`${r.kind} ${r.name}: ${state.reason}`}>
            <div class="uk-stack">
              <span>{state.message}</span>
              {artifact && <span>{say(T.source.stale, { duration: ago(v[F.fetched]) })}</span>}
            </div>
          </Notice>
        )}
      </div>
    </Section>
  );
}

/** What uses a source: the tables of the kinds that name it (those of none, not drawn). */
function UsedBy({ kind, object }: ResourceProps) {
  const say = useSay();
  const key = `${kind.kind}/${object.metadata?.namespace}/${object.metadata?.name}`;
  // How many of each, by the joined counts of the source itself (one query of it): a table drawn only for a kind with some.
  const got = useList({
    kind: kindRef(kind),
    scope: { namespaces: [object.metadata?.namespace ?? ''] },
    where: { field: 'core.name', op: 'eq', value: object.metadata?.name ?? '' },
    page: { limit: 1 },
    select: USERS.map((by) => `${F.usedBy(by)}.${kind.plural}`),
  });
  const values = got.items[0]?.values ?? {};
  const some = USERS.filter((by) => Number(values[`${F.usedBy(by)}.${kind.plural}`] ?? 0) > 0);
  return (
    <Section title={say(T.usedBy.title)} part="used-by">
      {some.length ? (
        <div class="uk-stack">
          {some.map((by) => (
            <KindTable key={by.id} kind={by} plain scope="all" where={{ field: own(F.uses, by), op: 'eq', value: key }} />
          ))}
        </div>
      ) : got.state === 'loading' ? null : (
        <Nothing>{say(T.usedBy.none)}</Nothing>
      )}
    </Section>
  );
}

type Entry = { id: string; namespace: string; name: string; k: string; kind: KindInfo | undefined };
/** What is known of a kind's entries, as they are now: by namespace/name, its health ('' none said); none there, gone. */
type Healths = ReadonlyMap<string, string>;

/** A kind's entries as they are now — one query of them all (by their names, of their namespaces), told up as it answers. */
function HealthsOf({ kind, entries, told }: { kind: KindInfo; entries: readonly Entry[]; told: (kind: string, healths: Healths) => void }) {
  const names = [...new Set(entries.map((e) => e.name))].sort();
  const namespaces = [...new Set(entries.map((e) => e.namespace))].sort();
  const got = useList({
    kind: kindRef(kind),
    ...(kind.namespaced ? { scope: { namespaces } } : {}),
    where: { field: 'core.name', op: 'in', values: names },
    page: { limit: names.length * Math.max(1, namespaces.length) },
    select: ['core.name', 'core.namespace', 'core.health'],
  });
  useEffect(() => {
    if (got.state === 'loading') return;
    told(kind.id, new Map(got.items.map((i) => [`${text(i.values?.['core.namespace'])}/${text(i.values?.['core.name'])}`, text(i.values?.['core.health'])])));
  }, [got.items, got.state]);
  return null;
}

/** One object it applied, as it is now (its kind's state; gone, NotFound; not known yet, nothing). */
function Live({ entry, healths }: { entry: Entry; healths: Healths | undefined }) {
  const say = useSay();
  if (!healths || !entry.kind) return null;
  const health = healths.get(`${entry.kind.namespaced ? entry.namespace : ''}/${entry.name}`);
  if (health === undefined)
    return (
      <Status tone="error" icon="circle-x">
        {say(T.inventory.notFound)}
      </Status>
    );
  return health ? <StatusOf kind={entry.kind} words={health} /> : <span class="uk-quiet">—</span>;
}

function Inventory({ object }: ResourceProps) {
  const say = useSay();
  const { kinds } = useServedKinds();
  const [healths, setHealths] = useState<ReadonlyMap<string, Healths>>(new Map());
  const entries: Entry[] = ((object as { status?: { inventory?: { entries?: { id: string; v: string }[] } } }).status?.inventory?.entries ?? []).map((e) => {
    // Flux's id: namespace_name_group_Kind (the core group's empty; a kind of the whole cluster's, no namespace).
    const [namespace = '', name = '', group = '', k = ''] = e.id.split('_');
    return { id: e.id, namespace, name, k, kind: kinds.get(group ? `${group}/${e.v}/${k}` : `${e.v}/${k}`) };
  });
  const byKind = new Map<KindInfo, Entry[]>();
  for (const e of entries) if (e.kind) byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e]);
  const told = (kind: string, of: Healths) => setHealths((had) => new Map(had).set(kind, of));
  return (
    <div class="uk-region uk-details" data-part="inventory">
      {[...byKind].map(([kind, of]) => (
        <HealthsOf key={kind.id} kind={kind} entries={of} told={told} />
      ))}
      {entries.length ? (
        <Table
          plain
          rows={entries}
          rowKey={(x) => x.id}
          reorderable={false}
          columns={[
            { id: 'kind', header: say(T.columns.kind), width: '150px', cell: (x) => <Badge>{x.k}</Badge> },
            {
              id: 'name',
              header: say(T.columns.name),
              width: 'minmax(0, 1fr)',
              cell: (x) => (x.kind ? <ObjectRef kind={x.kind.id} name={x.name} namespace={x.namespace || undefined} quiet /> : x.name),
            },
            { id: 'namespace', header: say(T.columns.namespace), width: '140px', cell: (x) => x.namespace || '—' },
            { id: 'status', header: say(T.columns.status), width: '150px', cell: (x) => <Live entry={x} healths={x.kind && healths.get(x.kind.id)} /> },
          ]}
        />
      ) : (
        <Nothing>{say(T.inventory.none)}</Nothing>
      )}
    </div>
  );
}

export function addViews(c: KubeContributor): void {
  c.add('Fill', 'flux.resource.view.source', section({ kinds: APPLIERS, order: 20, render: SourceOf }));
  c.add('Fill', 'flux.resource.view.used-by', section({ kinds: SOURCES, order: 20, render: UsedBy }));
  c.add('ResourceTab', 'flux.inventory', { target: forKinds(Kustomization), title: T.inventory.title, icon: 'packages', order: 150 });
  c.add('Fill', 'flux.resource.view.inventory', fill(slots.resource.view.tab('flux.inventory'), { render: (p) => <Inventory {...p} /> }));
  c.add('Slot', slots.resource.view.tab('flux.inventory').name, {}, { fallback: true });
}
