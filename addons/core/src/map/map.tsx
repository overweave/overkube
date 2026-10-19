import { type KindInfo, type KubeObject, kinds } from '@overkube/kube-types';
import {
  forKinds,
  KindView,
  type KubeContributor,
  kindOfRef,
  kindRef,
  lookOf,
  MapScope,
  type MapScopeSpec,
  mapCard,
  mapCardOf,
  openIn,
  type ResourceProps,
  StatusLook,
  slots,
  takes,
} from '@overkube/sdk';
import { fill, useGet, useList, usePage, useSay, useServedKinds } from '@overkube/sdk/preact';
import { Button, type MapCard, type MapGraph, MapView, Nothing, type Tone } from '@overkube/uikit';
import { inOrder } from '@overweave/ui';
import { slotElement, useDefinitions } from '@overweave/ui/preact';
import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { T } from '../texts.ts';
import { KINDS, namespaceGraph, neighboursOf, type PodRow, toneStatus, WORKLOADS, type World, worldGraph, worst } from './world.ts';

/*
 * An object's map, its view's Map tab: its scope, its kind's (MapScope — the
 * core's: a namespace's objects' what they are linked to; a node's pods; a
 * namespace's traffic; an addon's of its own kinds). A card chosen, its
 * object in short — what manages it, its summary as its Overview's — and a
 * way on: its own map (its view, on its Map tab: the way back the page's),
 * its view.
 */

const { Pod, Service, ConfigMap, Secret, PersistentVolumeClaim, Namespace, Node } = kinds.core.v1;
const { Ingress } = kinds.networking.v1;
const { HorizontalPodAutoscaler } = kinds.autoscaling.v2;
const { ReplicaSet } = kinds.apps.v1;

export const MAP_TAB = 'core.map';

/** Its pods' fields the map asks: its state (as its table says it), its workload, its node. */
const POD_FIELDS = ['core.name', 'core.namespace', 'core.labels', 'pods.v1.status', 'pods.v1.ready', 'pods.v1.containers', 'pods.v1.node', 'pods.v1.workload'];
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const podOf = (values: Readonly<Record<string, unknown>> | undefined): PodRow => ({
  name: text(values?.['core.name']),
  status: text(values?.['pods.v1.status']),
  ready: Number(values?.['pods.v1.ready'] ?? 0),
  containers: Number(values?.['pods.v1.containers'] ?? 0),
  node: text(values?.['pods.v1.node']),
  workload: text(values?.['pods.v1.workload']),
  labels: Array.isArray(values?.['core.labels']) ? (values['core.labels'] as string[]) : [],
});

/** A state's look and a kind's icon, as the page has them (StatusLook, KindView). */
export function useLooks(): Pick<World, 'look' | 'icon'> {
  const looks = useDefinitions(StatusLook);
  const views = useDefinitions(KindView);
  return useMemo(
    () => ({
      look: (kind, words) => {
        const l = lookOf(looks, kind, words);
        return l ? { tone: l.tone, icon: l.icon ?? 'help' } : undefined;
      },
      icon: (kind) => views.find((v) => v.name === kind.id)?.spec.icon,
    }),
    [looks, views],
  );
}

/** A namespace's world, as the map asks it of it alone (each kind it shows, its objects; its pods, their fields): none while it comes. */
export function useWorld(namespace: string): MapGraph | undefined {
  const scope = { namespaces: [namespace] };
  const all = (kind: KindInfo) => ({ kind: kindRef(kind), scope, page: { limit: 2000 } });
  const ingresses = useList<KubeObject>(all(Ingress));
  const services = useList<KubeObject>(all(Service));
  const workloads = WORKLOADS.map((k) => [k, useList<KubeObject>(all(k))] as const);
  const pods = useList({ ...all(Pod), select: POD_FIELDS });
  const claims = useList<KubeObject>(all(PersistentVolumeClaim));
  const scalers = useList<KubeObject>(all(HorizontalPodAutoscaler));
  const looks = useLooks();
  const answers = [ingresses, services, pods, claims, scalers, ...workloads.map(([, w]) => w)];
  const objects = (l: typeof ingresses) => l.items.flatMap((i) => (i.object ? [i.object] : [])) as never[];
  const version = answers.map((a) => a.items).concat();
  return useMemo(
    () =>
      answers.some((a) => a.state === 'loading')
        ? undefined
        : worldGraph({
            namespace,
            ingresses: objects(ingresses),
            services: objects(services),
            workloads: workloads.flatMap(([kind, l]) => objects(l).map((object) => ({ kind, object }))),
            pods: pods.items.map((i) => podOf(i.values)),
            claims: objects(claims),
            scalers: objects(scalers),
            ...looks,
          }),
    [namespace, looks, ...version, ...answers.map((a) => a.state)],
  );
}

/** What a pod's workload field names (Kind/name): its kind. */
const OWNERS: Record<string, KindInfo> = Object.fromEntries([...WORKLOADS, ReplicaSet].map((k) => [k.kind, k]));

/**
 * A node's map: the node, beside it what runs on it — each workload its pods here as its dots, a pod of none its own
 * card —, each namespace a frame (many: in a few columns); no link each, all of them its. Its pods' fields alone
 * asked — but of every pod of the cluster (the API is asked by namespace and name, not by node: those on it picked after). Its pods' fields alone asked, of every namespace.
 */
function useNodeMap(name: string): MapGraph | undefined {
  const pods = useList({ kind: kindRef(Pod), where: { field: 'pods.v1.node', op: 'eq', value: name }, page: { limit: 2000 }, select: POD_FIELDS });
  const { look, icon } = useLooks();
  return useMemo(() => {
    if (pods.state === 'loading') return undefined;
    const node: MapCard = {
      id: mapCard(kindRef(Node), undefined, name),
      layer: 0,
      title: name,
      sub: Node.kind,
      main: true,
      lines: [`${pods.items.length} pods`],
      ports: [],
      ...(icon(Node) ? { icon: icon(Node) } : {}),
    };
    const cards = new Map<string, MapCard>([[node.id, node]]);
    const tones = new Map<string, Tone[]>();
    for (const i of pods.items) {
      const p = podOf(i.values);
      const namespace = text(i.values?.['core.namespace']);
      const tone = look(Pod, p.status)?.tone ?? (p.ready === p.containers ? 'ok' : 'progress');
      const [ownerKind = '', owner = ''] = p.workload.split('/');
      const k = OWNERS[ownerKind];
      const id = owner ? mapCard(k ? kindRef(k) : `kind:${ownerKind}`, namespace, owner) : mapCard(kindRef(Pod), namespace, p.name);
      const kind = owner ? k : Pod;
      const c = cards.get(id) ?? {
        id,
        layer: 1,
        title: owner || p.name,
        sub: owner ? ownerKind : Pod.kind,
        group: namespace,
        ports: [],
        ...(owner ? { dots: [] } : { lines: [p.status] }),
        ...(!kind ? { external: true } : {}),
        ...(kind && icon(kind) ? { icon: icon(kind) } : {}),
      };
      cards.set(id, c);
      tones.set(id, [...(tones.get(id) ?? []), tone]);
      c.dots?.push({ tone, title: `${p.name}: ${p.status}` });
      c.status = toneStatus(worst(tones.get(id) ?? []), owner ? undefined : p.status);
    }
    // What runs on it, its frames beside it: no link each (all of them its).
    const runs = [...cards.values()].filter((c) => c !== node);
    const namespaces = [...new Set(runs.flatMap((c) => (c.group ? [c.group] : [])))].sort();
    return {
      kinds: KINDS,
      cards: [...cards.values()],
      links: [],
      groups: namespaces.map((n) => ({ id: n, title: n, sub: Namespace.kind, icon: icon(Namespace) ?? 'folder' })),
      wrap: [1],
    };
  }, [pods.items, pods.state, name, look, icon]);
}

/** The kinds whose map is what they are linked to, in their namespace's world. */
const LINKED = [Pod, Service, Ingress, ConfigMap, Secret, PersistentVolumeClaim, HorizontalPodAutoscaler, ...WORKLOADS];

/** One object of a card, chosen on its map: what manages it, its summary (its kind's own, as its Overview's), its own map, its view. */
function Details({ id, extra }: { id: string; extra?: ComponentChildren }) {
  const say = useSay();
  const page = usePage();
  const { kinds: served } = useServedKinds();
  const { ref, namespace, name } = mapCardOf(id);
  const kind = kindOfRef(served, ref);
  const got = useGet<KubeObject>(kind ? { kind: ref, ...(namespace ? { namespace } : {}), name } : undefined);
  const scopes = useDefinitions(MapScope);
  if (!kind) return <Nothing>{say(T.map.notServed, { kind: ref.replace(/^kind:/, '') })}</Nothing>;
  if (!got.object) return got.state === 'loading' ? null : <Nothing>{say(T.map.notFound, { kind: kind.kind, name })}</Nothing>;
  const object = got.object;
  const scoped = scopes.some((s) => takes(s.spec.target, kind));
  return (
    <div class="uk-stack">
      <span class="uk-line">
        <span class="uk-quiet">{kind.kind}</span>
        {slotElement(slots.resource.view.marks, { kind, object })}
      </span>
      {slotElement(slots.resource.view.summary, { kind, object })}
      <span class="uk-line">
        {extra}
        {scoped && (
          <Button size="sm" icon="network" onClick={() => page.navigate(openIn(page.path.peek(), kind, object, MAP_TAB))}>
            {say(T.map.center)}
          </Button>
        )}
        <Button size="sm" icon="external" onClick={() => page.navigate(openIn(page.path.peek(), kind, object))}>
          {say(T.map.open, { kind: kind.kind })}
        </Button>
      </span>
    </div>
  );
}

/** Its view's Map tab: its scope's map (the first MapScope taking its kind), started on it. */
function MapTab(props: ResourceProps) {
  const scope = inOrder(useDefinitions(MapScope)).find((s) => takes(s.spec.target, props.kind));
  // Its scope's hook, its own component's (another scope: another component, its hooks its own).
  return scope ? <ScopedMap key={scope.name} use={scope.spec.use} {...props} /> : null;
}

function ScopedMap({ use, kind, object }: ResourceProps & { use: MapScopeSpec['use'] }) {
  const graph = use({ kind, object });
  const say = useSay();
  const focus = mapCard(kindRef(kind), kind.namespaced ? object.metadata?.namespace : undefined, object.metadata?.name ?? '');
  if (!graph) return null;
  // Nothing linked to it (a ConfigMap no workload reads): said so, not an empty map.
  if (!graph.cards.length && kind.id !== Namespace.id) return <Nothing>{say(T.map.unlinked, { kind: kind.kind, name: object.metadata?.name ?? '' })}</Nothing>;
  return <MapRegion graph={graph} focus={focus} />;
}

/**
 * A map drawn in its region (a view's tab, a page): a card chosen, its object in short; opened, its view (or what
 * opens says: the cluster's map, a namespace zoomed into) — one of no kind served or not there, none.
 */
export function MapRegion({
  graph,
  focus,
  opens,
  extra,
  height = 'calc(100vh - 150px)',
}: {
  graph: MapGraph;
  focus?: string;
  opens?: (id: string) => (() => void) | undefined;
  /** More a card chosen offers (before its own map and its view). */
  extra?: (id: string) => ComponentChildren;
  height?: string;
}) {
  const page = usePage();
  const { kinds: served } = useServedKinds();
  const [selected, setSelected] = useState<string | null>(null);
  const say = useSay();
  if (!graph.cards.length) return <Nothing>{say(T.map.empty)}</Nothing>;
  return (
    <div class="uk-region" data-part="map" style={{ gridColumn: '1 / -1', height }}>
      <MapView
        graph={graph}
        selected={selected}
        onSelect={setSelected}
        {...(focus && graph.cards.some((c) => c.id === focus) ? { focus } : {})}
        opens={(id) => {
          const own = opens?.(id);
          if (own) return own;
          const c = mapCardOf(id);
          const k = kindOfRef(served, c.ref);
          return k && !graph.cards.find((x) => x.id === id)?.missing
            ? () => page.navigate(openIn(page.path.peek(), k, { metadata: { name: c.name, ...(c.namespace ? { namespace: c.namespace } : {}) } }))
            : undefined;
        }}
        details={(id) => <Details id={id} extra={extra?.(id)} />}
      />
    </div>
  );
}

export function addMap(c: KubeContributor): void {
  const namespaceOf = (o: KubeObject) => o.metadata?.namespace ?? '';
  c.add('MapScope', 'core.linked', {
    target: forKinds(...LINKED),
    order: 100,
    use: ({ kind, object }) => {
      const world = useWorld(namespaceOf(object));
      const focus = mapCard(kindRef(kind), namespaceOf(object), object.metadata?.name ?? '');
      return useMemo(() => world && neighboursOf(world, focus), [world, focus]);
    },
  });
  c.add('MapScope', 'core.namespace', {
    target: forKinds(Namespace),
    order: 100,
    use: ({ object }) => {
      const world = useWorld(object.metadata?.name ?? '');
      return useMemo(() => world && namespaceGraph(world), [world]);
    },
  });
  c.add('MapScope', 'core.node', { target: forKinds(Node), order: 100, use: ({ object }) => useNodeMap(object.metadata?.name ?? '') });
  // Its tab: of a kind some MapScope takes (the view leaves it out of the others').
  c.add('ResourceTab', MAP_TAB, { target: {}, title: T.resource.view.tabs.map, icon: 'network', order: 950 });
  c.add('Fill', 'core.resource.view.map', fill(slots.resource.view.tab(MAP_TAB), { render: (p) => <MapTab {...p} /> }));
}
