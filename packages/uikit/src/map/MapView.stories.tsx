import type { Meta, StoryObj } from '@storybook/preact-vite';
import { useState } from 'preact/hooks';
import { MapView } from './MapView';
import type { MapCard, MapGraph, MapLinkKind, MapPattern } from './types';

/*
 * One map, its patterns: the same objects (a namespace's: an Ingress, its
 * Services, their workloads and pods, what those mount, the nodes they run
 * on) made into maps two ways — its traffic, left to right; where its pods
 * run — and drawn by the one engine.
 */

interface Pod {
  name: string;
  of: string;
  node: string;
  tone: 'ok' | 'progress' | 'error';
}
interface Scope {
  ingress: { name: string; hosts: { host: string; service: string; port: number }[] };
  services: { name: string; port: number; selects: string }[];
  workloads: { name: string; kind: string; ready: string; mounts: { name: string; kind: 'ConfigMap' | 'Secret' | 'PersistentVolumeClaim'; at: string }[] }[];
  pods: Pod[];
  nodes: string[];
}

const SCOPE: Scope = {
  ingress: {
    name: 'shop',
    hosts: [
      { host: 'shop.example.com', service: 'web', port: 80 },
      { host: 'api.shop.example.com', service: 'api', port: 8080 },
    ],
  },
  services: [
    { name: 'web', port: 80, selects: 'web' },
    { name: 'api', port: 8080, selects: 'api' },
    { name: 'db', port: 5432, selects: 'db' },
  ],
  workloads: [
    { name: 'web', kind: 'Deployment', ready: '2/2', mounts: [{ name: 'web-config', kind: 'ConfigMap', at: '/etc/nginx' }] },
    { name: 'api', kind: 'Deployment', ready: '1/2', mounts: [{ name: 'api-env', kind: 'Secret', at: '/run/secrets' }] },
    { name: 'db', kind: 'StatefulSet', ready: '1/1', mounts: [{ name: 'data-db-0', kind: 'PersistentVolumeClaim', at: '/var/lib/postgresql' }] },
  ],
  pods: [
    { name: 'web-7d4b9-x2k8p', of: 'web', node: 'node-a', tone: 'ok' },
    { name: 'web-7d4b9-q9rt2', of: 'web', node: 'node-b', tone: 'ok' },
    { name: 'api-5c6f8-mm2kd', of: 'api', node: 'node-a', tone: 'ok' },
    { name: 'api-5c6f8-zz81c', of: 'api', node: 'node-b', tone: 'error' },
    { name: 'db-0', of: 'db', node: 'node-b', tone: 'ok' },
  ],
  nodes: ['node-a', 'node-b'],
};

const KINDS: Record<string, MapLinkKind> = {
  traffic: { label: 'traffic', tint: 'green', weight: 2.2, icon: 'globe' },
  selects: { label: 'selects', tint: 'blue', weight: 2 },
  owns: { label: 'owns', tint: 'slate' },
  config: { label: 'ConfigMap', tint: 'gray', icon: 'file', weight: 1.4 },
  secret: { label: 'Secret', tint: 'pink', icon: 'key', weight: 1.4 },
  volume: { label: 'volume', tint: 'amber', icon: 'disk', weight: 1.8 },
  runs: { label: 'runs on', tint: 'violet' },
};

const TONE_ICON = { ok: 'circle-check', progress: 'spinner', error: 'circle-x' } as const;
const status = (tone: Pod['tone']): MapCard['status'] => ({ tone, icon: TONE_ICON[tone] });
const MOUNT = { ConfigMap: 'config', Secret: 'secret', PersistentVolumeClaim: 'volume' } as const;

/** Its traffic: the Ingress's hosts, the Services they go to, the workloads those select, their pods, what they mount. */
const traffic: MapPattern<Scope> = (s) => {
  const cards: MapCard[] = [
    {
      id: 'ing',
      layer: 0,
      title: s.ingress.name,
      icon: 'globe',
      sub: 'Ingress',
      ports: s.ingress.hosts.map((h) => ({ id: h.host, side: 'out', label: h.host, kind: 'traffic' })),
    },
    ...s.services.map(
      (v): MapCard => ({
        id: `svc:${v.name}`,
        layer: 1,
        title: v.name,
        icon: 'network',
        sub: 'Service',
        ports: [
          { id: 'in', side: 'in', label: String(v.port), kind: 'traffic' },
          { id: 'out', side: 'out' },
        ],
      }),
    ),
    ...s.workloads.map(
      (w): MapCard => ({
        id: `w:${w.name}`,
        layer: 2,
        title: w.name,
        icon: 'layers',
        sub: w.kind,
        lines: [`${w.ready} ready`],
        status: status(w.ready.split('/')[0] === w.ready.split('/')[1] ? 'ok' : 'progress'),
        ports: [{ id: 'in', side: 'in' }, { id: 'pods', side: 'out' }, ...w.mounts.map((m) => ({ id: m.name, side: 'out' as const, label: m.at, kind: MOUNT[m.kind] }))],
      }),
    ),
    ...s.pods.map((p): MapCard => ({ id: `pod:${p.name}`, layer: 3, title: p.name, icon: 'cube', status: status(p.tone), lines: [p.node], ports: [{ id: 'in', side: 'in' }] })),
    ...s.workloads.flatMap((w) =>
      w.mounts.map(
        (m): MapCard => ({
          id: `m:${m.name}`,
          layer: 3,
          title: m.name,
          icon: m.kind === 'Secret' ? 'key' : m.kind === 'ConfigMap' ? 'file' : 'disk',
          sub: m.kind,
          ports: [{ id: 'in', side: 'in' }],
        }),
      ),
    ),
  ];
  return {
    kinds: KINDS,
    cards,
    links: [
      ...s.ingress.hosts.map((h) => ({ id: `${h.host}>${h.service}`, kind: 'traffic', from: { card: 'ing', port: h.host }, to: { card: `svc:${h.service}`, port: 'in' } })),
      ...s.services.map((v) => ({ id: `${v.name}>w`, kind: 'selects', from: { card: `svc:${v.name}`, port: 'out' }, to: { card: `w:${v.selects}`, port: 'in' } })),
      ...s.pods.map((p) => ({ id: `${p.of}>${p.name}`, kind: 'owns', from: { card: `w:${p.of}`, port: 'pods' }, to: { card: `pod:${p.name}`, port: 'in' } })),
      ...s.workloads.flatMap((w) =>
        w.mounts.map((m) => ({ id: `${w.name}>${m.name}`, kind: MOUNT[m.kind], from: { card: `w:${w.name}`, port: m.name }, to: { card: `m:${m.name}`, port: 'in' } })),
      ),
    ],
  };
};

/** Where its pods run: each node, the pods on it, the workloads they are of. */
const placement: MapPattern<Scope> = (s) => ({
  kinds: KINDS,
  cards: [
    ...s.nodes.map((n): MapCard => ({ id: `node:${n}`, layer: 0, title: n, icon: 'server', sub: 'Node', status: status('ok'), ports: [{ id: 'out', side: 'out' }] })),
    ...s.pods.map(
      (p): MapCard => ({
        id: `pod:${p.name}`,
        layer: 1,
        title: p.name,
        icon: 'cube',
        status: status(p.tone),
        ports: [
          { id: 'in', side: 'in' },
          { id: 'out', side: 'out' },
        ],
      }),
    ),
    ...s.workloads.map(
      (w): MapCard => ({ id: `w:${w.name}`, layer: 2, title: w.name, icon: 'layers', sub: w.kind, lines: [`${w.ready} ready`], ports: [{ id: 'in', side: 'in' }] }),
    ),
  ],
  links: [
    ...s.pods.map((p) => ({ id: `${p.node}>${p.name}`, kind: 'runs', from: { card: `node:${p.node}`, port: 'out' }, to: { card: `pod:${p.name}`, port: 'in' } })),
    ...s.pods.map((p) => ({ id: `${p.name}>${p.of}`, kind: 'owns', from: { card: `pod:${p.name}`, port: 'out' }, to: { card: `w:${p.of}`, port: 'in' } })),
  ],
});

function MapStory({ graph, focus }: { graph: MapGraph; focus?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ height: '560px' }}>
      <MapView
        graph={graph}
        selected={selected}
        onSelect={setSelected}
        {...(focus ? { focus } : {})}
        opens={(id) => (id.startsWith('w:') ? () => alert(`open ${id}`) : undefined)}
        details={(id, pick) => {
          const linked = graph.links.filter((l) => l.from.card === id || l.to.card === id).map((l) => (l.from.card === id ? l.to.card : l.from.card));
          return (
            <div class="uk-stack">
              {linked.map((c) => (
                <button key={c} type="button" class="uk-cell-link" onClick={() => pick(c)}>
                  {graph.cards.find((x) => x.id === c)?.title}
                </button>
              ))}
            </div>
          );
        }}
      />
    </div>
  );
}

const meta = { title: 'Map/MapView', component: MapStory } satisfies Meta<typeof MapStory>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Pattern: its traffic — Ingress, Services, workloads, their pods and what they mount. */
export const Traffic: Story = { args: { graph: traffic(SCOPE) } };
/** Pattern: where its pods run — nodes, pods, workloads. */
export const Placement: Story = { args: { graph: placement(SCOPE) } };
/** An object's own map, started on it. */
export const Focused: Story = { args: { graph: { ...traffic(SCOPE), cards: traffic(SCOPE).cards.map((c) => (c.id === 'w:api' ? { ...c, main: true } : c)) }, focus: 'w:api' } };
/** What is not there: a Service selecting nothing, dashed; another namespace's, faint. */
export const Missing: Story = {
  args: {
    graph: {
      kinds: KINDS,
      cards: [
        { id: 'ing', layer: 0, title: 'shop', icon: 'globe', sub: 'Ingress', ports: [{ id: 'h', side: 'out', label: 'old.shop.example.com', kind: 'traffic' }] },
        { id: 'svc', layer: 1, title: 'legacy', icon: 'network', sub: 'Service', missing: true, warn: 'Service legacy not found', ports: [{ id: 'in', side: 'in' }] },
        { id: 'ext', layer: 1, title: 'auth', icon: 'network', sub: 'Service · seed-net', external: true, ports: [{ id: 'in', side: 'in' }] },
      ],
      links: [{ id: 'l', kind: 'traffic', missing: true, from: { card: 'ing', port: 'h' }, to: { card: 'svc', port: 'in' } }],
    },
  },
};
