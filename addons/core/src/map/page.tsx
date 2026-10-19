import { kinds } from '@overkube/kube-types';
import { type KubeContributor, kindRef, mapCard, mapCardOf, slots } from '@overkube/sdk';
import { fill, useList, useLists, usePage, usePageProps, useSay } from '@overkube/sdk/preact';
import { Button, type MapCard, type MapGraph, PageHeader, type Tone } from '@overkube/uikit';
import { useMemo } from 'preact/hooks';
import { T } from '../texts.ts';
import { MapRegion, useLooks, useWorld } from './map.tsx';
import { KINDS, namespaceGraph, toneStatus, worst } from './world.ts';

/*
 * The cluster's map, a page of its own (/map): each namespace a card — its
 * workloads its dots (each its health) —, each node a card (its state, its
 * roles and version). A namespace zoomed into (/map/<namespace>): its own
 * map, its objects and their links (as its Map tab has it); the way back,
 * the cluster's. Asked: namespaces, nodes, the workloads of every namespace
 * (a field each: their health) — no pod (counting them would hold every pod
 * of the cluster). One who may not list the namespaces: those their
 * workloads are in.
 */

const { Namespace, Node } = kinds.core.v1;
const { Deployment, StatefulSet, DaemonSet } = kinds.apps.v1;
const WORKLOADS = [Deployment, StatefulSet, DaemonSet];
export const MAP_PATH = '/map';

const text = (v: unknown) => (typeof v === 'string' ? v : '');

function useClusterMap(): MapGraph | undefined {
  const { look, icon } = useLooks();
  const namespaces = useList({ kind: kindRef(Namespace), page: { limit: 1000 }, select: ['core.name'] });
  const nodes = useList({ kind: kindRef(Node), page: { limit: 1000 }, select: ['core.name', 'nodes.v1.status', 'nodes.v1.roles', 'nodes.v1.version'] });
  const workloads = useLists(WORKLOADS.map((k) => ({ kind: kindRef(k), page: { limit: 5000 }, select: ['core.name', 'core.namespace', `${kindRef(k)}.health`] })));
  const answers = [namespaces, nodes, ...workloads];
  return useMemo(() => {
    if (answers.some((a) => a.state === 'loading')) return undefined;
    const dots = new Map<string, { tone: Tone; title: string }[]>();
    WORKLOADS.forEach((k, i) => {
      for (const x of workloads[i]?.items ?? []) {
        const ns = text(x.values?.['core.namespace']);
        const health = text(x.values?.[`${kindRef(k)}.health`]);
        dots.set(ns, [...(dots.get(ns) ?? []), { tone: look(k, health)?.tone ?? 'unknown', title: `${k.kind} ${text(x.values?.['core.name'])}: ${health}` }]);
      }
    });
    // Those listed, and those its workloads are in (one who may not list the namespaces: those of theirs).
    const names = [...new Set([...namespaces.items.map((x) => text(x.values?.['core.name'])), ...dots.keys()])].filter(Boolean).sort();
    const cards: MapCard[] = [
      ...names.map((name): MapCard => {
        const of = dots.get(name) ?? [];
        return {
          id: mapCard(kindRef(Namespace), undefined, name),
          layer: 0,
          title: name,
          sub: Namespace.kind,
          lines: [`${of.length} workloads`],
          dots: of,
          ports: [],
          ...(of.length ? { status: toneStatus(worst(of.map((d) => d.tone))) } : {}),
          ...(icon(Namespace) ? { icon: icon(Namespace) } : {}),
        };
      }),
      ...nodes.items.map((x): MapCard => {
        const name = text(x.values?.['core.name']);
        const status = text(x.values?.['nodes.v1.status']);
        const l = look(Node, status);
        return {
          id: mapCard(kindRef(Node), undefined, name),
          layer: 1,
          title: name,
          sub: Node.kind,
          lines: [
            [...(Array.isArray(x.values?.['nodes.v1.roles']) ? (x.values['nodes.v1.roles'] as string[]) : []), text(x.values?.['nodes.v1.version'])].filter(Boolean).join(' · '),
          ],
          ports: [],
          ...(l ? { status: { ...l, title: status } } : {}),
          ...(icon(Node) ? { icon: icon(Node) } : {}),
        };
      }),
    ];
    return { kinds: KINDS, cards, links: [], wrap: [0, 1] };
  }, [look, icon, ...answers.map((a) => a.items), ...answers.map((a) => a.state)]);
}

function ClusterMap() {
  const page = usePage();
  const say = useSay();
  const graph = useClusterMap();
  const zoom = (id: string) => {
    const c = mapCardOf(id);
    return c.ref === kindRef(Namespace) ? () => page.navigate(`${MAP_PATH}/${c.name}`) : undefined;
  };
  return graph ? (
    <MapRegion
      graph={graph}
      height="calc(100vh - 180px)"
      opens={zoom}
      extra={(id) => {
        const go = zoom(id);
        return go ? (
          <Button size="sm" icon="maximize" onClick={go}>
            {say(T.map.zoom)}
          </Button>
        ) : null;
      }}
    />
  ) : null;
}

function NamespaceMap({ namespace }: { namespace: string }) {
  const world = useWorld(namespace);
  const graph = useMemo(() => world && namespaceGraph(world), [world]);
  return graph ? <MapRegion graph={graph} height="calc(100vh - 180px)" /> : null;
}

function MapPage() {
  const say = useSay();
  const page = usePage();
  const namespace = usePageProps().rest.replace(/^\/+|\/+$/g, '');
  return (
    <div class="uk-stack" data-part="map-page">
      <PageHeader
        level={2}
        icon="network"
        sub={
          <span class="uk-line" data-part="crumbs">
            {namespace ? (
              <a
                href={page.href(MAP_PATH)}
                onClick={(e) => {
                  e.preventDefault();
                  page.navigate(MAP_PATH);
                }}
              >
                {say(T.map.cluster)}
              </a>
            ) : (
              <span>{say(T.map.cluster)}</span>
            )}
            {namespace && <span class="uk-quiet">›</span>}
            {namespace && <b>{namespace}</b>}
          </span>
        }
      >
        {say(T.map.title)}
      </PageHeader>
      {namespace ? <NamespaceMap key={namespace} namespace={namespace} /> : <ClusterMap />}
    </div>
  );
}

export function addMapPage(c: KubeContributor): void {
  c.add('Page', 'map', { path: `${MAP_PATH}/*`, title: T.map.title, icon: 'network', pinned: true, order: 5 });
  c.add('Fill', 'core.page.map', fill(slots.page('map'), { render: MapPage }));
}
