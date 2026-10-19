import { type KindInfo, type KubeObject, kinds, type ObjectOf } from '@overkube/kube-types';
import { kindRef, mapCard } from '@overkube/sdk';
import type { MapCard, MapGraph, MapLink, MapLinkKind, Tone } from '@overkube/uikit';
import { picks } from '../kinds/shared.tsx';

/*
 * A namespace as a map (its world): what comes in (its Ingresses' hosts,
 * their Services), what selects what (a Service its workloads, by their
 * pods' labels), what runs (a workload, its pods a dot each; a pod's own
 * card, its workload's and its node's links, for a pod's or a node's map),
 * what it reads and keeps (ConfigMaps, Secrets — named by the workloads that
 * use them, never listed —, claims and their volumes), what scales it, where
 * its pods run (nodes). Each object a card (mapCard: its kind's ref,
 * namespace, name); what is named but is not there, drawn so. Made of what
 * the map asks of the namespace (its objects, its pods' fields): no other
 * kind asked, nothing asked elsewhere.
 */

const { Pod, Service, ConfigMap, Secret, PersistentVolumeClaim, PersistentVolume, Node } = kinds.core.v1;
const { Deployment, StatefulSet, DaemonSet } = kinds.apps.v1;
const { Job, CronJob } = kinds.batch.v1;
const { Ingress } = kinds.networking.v1;
const { HorizontalPodAutoscaler } = kinds.autoscaling.v2;

const kindOfCard = (id: string) => id.split('|')[0] ?? '';

/** What links mean on a Kubernetes map: each its tint, its weight. */
export const KINDS: Record<string, MapLinkKind> = {
  traffic: { label: 'traffic', tint: 'green', weight: 2.2, icon: 'globe' },
  selects: { label: 'selects', tint: 'blue', weight: 2 },
  owns: { label: 'owns', tint: 'slate' },
  config: { label: 'ConfigMap', tint: 'gray', icon: 'file', weight: 1.4 },
  secret: { label: 'Secret', tint: 'pink', icon: 'key', weight: 1.4 },
  volume: { label: 'volume', tint: 'amber', icon: 'disk', weight: 1.8 },
  binds: { label: 'binds', tint: 'orange' },
  runs: { label: 'runs on', tint: 'violet' },
  scales: { label: 'scales', tint: 'teal', weight: 1.4 },
};

/** Its columns: what comes in, what routes it, what runs, what it uses and runs on, what that is bound to. */
const LAYER = { ingress: 0, service: 1, workload: 2, used: 3, bound: 4 } as const;

type Template = {
  metadata?: { labels?: Record<string, string> };
  spec?: {
    volumes?: { name: string; configMap?: { name: string }; secret?: { secretName: string }; persistentVolumeClaim?: { claimName: string } }[];
    containers?: {
      envFrom?: { configMapRef?: { name: string }; secretRef?: { name: string } }[];
      env?: { valueFrom?: { configMapKeyRef?: { name: string }; secretKeyRef?: { name: string } } }[];
      volumeMounts?: { name: string; mountPath: string }[];
    }[];
  };
};

type Workload = KubeObject & {
  spec?: {
    replicas?: number;
    /** A job's. */
    completions?: number;
    /** A cron job's. */
    schedule?: string;
    suspend?: boolean;
    jobTemplate?: { spec?: { template?: Template } };
    template?: {
      metadata?: { labels?: Record<string, string> };
      spec?: {
        volumes?: { name: string; configMap?: { name: string }; secret?: { secretName: string }; persistentVolumeClaim?: { claimName: string } }[];
        containers?: {
          envFrom?: { configMapRef?: { name: string }; secretRef?: { name: string } }[];
          env?: { valueFrom?: { configMapKeyRef?: { name: string }; secretKeyRef?: { name: string } } }[];
          volumeMounts?: { name: string; mountPath: string }[];
        }[];
      };
    };
    volumeClaimTemplates?: { metadata?: { name?: string } }[];
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    numberReady?: number;
    desiredNumberScheduled?: number;
    /** A job's; a cron job's active, its jobs. */
    succeeded?: number;
    active?: number | unknown[];
    conditions?: { type: string; status: string }[];
  };
};

/** A pod as the map asks it: its fields (its state as its table says it, its workload, its node). */
export interface PodRow {
  name: string;
  status: string;
  ready: number;
  containers: number;
  node: string;
  /** Kind/name of the workload it is of (kube-fields' pods.v1.workload): none, "". */
  workload: string;
  /** Its labels, key=value (what a Service selects of a pod of no workload). */
  labels: readonly string[];
}

export interface World {
  namespace: string;
  ingresses: readonly ObjectOf<typeof Ingress>[];
  services: readonly ObjectOf<typeof Service>[];
  workloads: readonly { kind: KindInfo; object: Workload }[];
  pods: readonly PodRow[];
  claims: readonly ObjectOf<typeof PersistentVolumeClaim>[];
  scalers: readonly ObjectOf<typeof HorizontalPodAutoscaler>[];
  /** A state's look, as a table draws it (its kind's words): its tone and icon. */
  look: (kind: KindInfo, words: string) => { tone: Tone; icon: string } | undefined;
  /** A kind's icon, as the navigation has it. */
  icon: (kind: KindInfo) => string | undefined;
}

const ICON: Partial<Record<Tone, string>> = { ok: 'circle-check', error: 'circle-x', progress: 'spinner', warn: 'warning', waiting: 'hourglass', done: 'circle-dashed' };
const WORST: Tone[] = ['error', 'warn', 'progress', 'waiting', 'unknown', 'gone', 'done', 'ok'];
/** The worst of states. */
export const worst = (tones: readonly Tone[]) => WORST.find((t) => tones.includes(t));
/** A card's state of a tone. */
export const toneStatus = (tone: Tone | undefined, title?: string): MapCard['status'] => (tone ? { tone, icon: ICON[tone] ?? 'help', ...(title ? { title } : {}) } : undefined);

const labelsOf = (p: PodRow) => Object.fromEntries(p.labels.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

/** A workload's state on its card: what it has of what it wants, its look (its pods' worst, else its own). */
function stateOf(kind: KindInfo, o: Workload, tones: Tone[]): Partial<MapCard> {
  const status = toneStatus;
  if (kind.id === CronJob.id) {
    const active = Array.isArray(o.status?.active) ? o.status.active.length : 0;
    return {
      lines: [[o.spec?.schedule, o.spec?.suspend ? 'suspended' : active ? `${active} active` : ''].filter(Boolean).join(' · ')],
      status: o.spec?.suspend ? status('done', 'Suspended') : status(active ? 'progress' : 'ok'),
    };
  }
  if (kind.id === Job.id) {
    const want = o.spec?.completions ?? 1;
    const done = o.status?.succeeded ?? 0;
    const is = (type: string) => o.status?.conditions?.some((c) => c.type === type && c.status === 'True');
    const tone: Tone = is('Failed') ? 'error' : is('Complete') ? 'done' : (worst(tones) ?? (Number(o.status?.active ?? 0) ? 'progress' : 'waiting'));
    return { lines: [`${done}/${want} succeeded`], status: status(tone, is('Failed') ? 'Failed' : is('Complete') ? 'Complete' : undefined) };
  }
  const desired = o.spec?.replicas ?? o.status?.desiredNumberScheduled ?? tones.length;
  const ready = o.status?.readyReplicas ?? o.status?.numberReady ?? 0;
  return { lines: [`${ready}/${desired} ready`], status: status(desired === 0 ? 'done' : (worst(tones) ?? (ready < desired ? 'progress' : 'ok'))) };
}

/** The world's graph: every object of it (and those it names), every link between them. */
export function worldGraph(w: World): MapGraph {
  const cards = new Map<string, MapCard>();
  const links = new Map<string, MapLink>();
  const ns = w.namespace;
  const card = (kind: KindInfo, name: string, layer: number, more: Partial<MapCard> = {}): MapCard => {
    const id = mapCard(kindRef(kind), kind.namespaced ? ns : undefined, name);
    const had = cards.get(id);
    if (had) return had;
    const c: MapCard = { id, layer, title: name, sub: kind.kind, ports: [], ...(w.icon(kind) ? { icon: w.icon(kind) } : {}), ...more };
    cards.set(id, c);
    return c;
  };
  const port = (c: MapCard, id: string, side: 'in' | 'out', label?: string, kind?: string) => {
    if (!c.ports.some((p) => p.id === id)) c.ports.push({ id, side, ...(label ? { label } : {}), ...(kind ? { kind } : {}) });
    return id;
  };
  const link = (kind: string, from: MapCard, fromPort: string, to: MapCard, toPort: string, missing = false) => {
    const id = `${from.id}.${fromPort}>${to.id}.${toPort}`;
    links.set(id, { id, kind, from: { card: from.id, port: fromPort }, to: { card: to.id, port: toPort }, ...(missing ? { missing } : {}) });
  };
  const status = toneStatus;

  // What runs: a workload's pods (theirs by kube-fields' workload), a dot each.
  const podsOf = new Map<string, PodRow[]>();
  for (const p of w.pods) podsOf.set(p.workload, [...(podsOf.get(p.workload) ?? []), p]);
  const podTone = (p: PodRow): Tone => w.look(Pod, p.status)?.tone ?? (p.ready === p.containers ? 'ok' : 'progress');
  const workloadCards = new Map<string, MapCard>();
  for (const { kind, object } of w.workloads) {
    const name = object.metadata?.name ?? '';
    const pods = podsOf.get(`${kind.kind}/${name}`) ?? [];
    const dots = pods.map((p) => ({ tone: podTone(p), title: `${p.name}: ${p.status}` }));
    const c = card(kind, name, kind.id === CronJob.id ? LAYER.service : LAYER.workload, { ...stateOf(kind, object, pods.map(podTone)), dots });
    port(c, 'in', 'in');
    workloadCards.set(`${kind.kind}/${name}`, c);
    // A cron job's job: its own (what it reads, its cron job's: its template).
    const cron = kind.id === Job.id ? object.metadata?.ownerReferences?.find((o) => o.controller && o.kind === CronJob.kind)?.name : undefined;
    if (cron) continue;
    // What it reads and keeps: its volumes (by where they are mounted), its env's ConfigMaps and Secrets.
    const spec = (kind.id === CronJob.id ? object.spec?.jobTemplate?.spec?.template : object.spec?.template)?.spec;
    const mounts = new Map<string, string>();
    for (const m of (spec?.containers ?? []).flatMap((x) => x.volumeMounts ?? [])) if (!mounts.has(m.name)) mounts.set(m.name, m.mountPath);
    const uses = (k: KindInfo, used: string, as: string, label: string) => {
      const target = card(k, used, LAYER.used);
      port(target, 'in', 'in');
      link(as, c, port(c, `${as}:${used}`, 'out', label, as), target, 'in');
    };
    for (const v of spec?.volumes ?? []) {
      const at = mounts.get(v.name) ?? v.name;
      if (v.configMap) uses(ConfigMap, v.configMap.name, 'config', at);
      if (v.secret) uses(Secret, v.secret.secretName, 'secret', at);
      if (v.persistentVolumeClaim) uses(PersistentVolumeClaim, v.persistentVolumeClaim.claimName, 'volume', at);
    }
    for (const x of spec?.containers ?? []) {
      for (const e of x.envFrom ?? []) {
        if (e.configMapRef) uses(ConfigMap, e.configMapRef.name, 'config', 'envFrom');
        if (e.secretRef) uses(Secret, e.secretRef.name, 'secret', 'envFrom');
      }
      for (const e of x.env ?? []) {
        if (e.valueFrom?.configMapKeyRef) uses(ConfigMap, e.valueFrom.configMapKeyRef.name, 'config', 'env');
        if (e.valueFrom?.secretKeyRef) uses(Secret, e.valueFrom.secretKeyRef.name, 'secret', 'env');
      }
    }
    // A stateful set's claims: its pods' (<template>-<name>-<ordinal>).
    if (kind.id === StatefulSet.id)
      for (const t of object.spec?.volumeClaimTemplates ?? [])
        for (const claim of w.claims.filter((x) => (x.metadata?.name ?? '').startsWith(`${t.metadata?.name}-${name}-`)))
          uses(PersistentVolumeClaim, claim.metadata?.name ?? '', 'volume', t.metadata?.name ?? '');
  }

  // A cron job, its jobs.
  for (const { kind, object } of w.workloads) {
    const cron = kind.id === Job.id && object.metadata?.ownerReferences?.find((o) => o.controller && o.kind === CronJob.kind)?.name;
    const from = cron && workloadCards.get(`${CronJob.kind}/${cron}`);
    const to = workloadCards.get(`${Job.kind}/${object.metadata?.name}`);
    if (from && to) link('owns', from, port(from, 'jobs', 'out'), to, 'in');
  }

  // What a pod is of but the map has not (a replica set of none, an operator's kind): a card of it, its pods its dots — not a way to it.
  for (const [owner, pods] of podsOf) {
    if (!owner || workloadCards.has(owner)) continue;
    const [kind = '', name = ''] = owner.split('/');
    const id = mapCard(`kind:${kind}`, ns, name);
    const tones = pods.map(podTone);
    const c: MapCard = {
      id,
      layer: LAYER.workload,
      title: name,
      sub: kind,
      external: true,
      ports: [{ id: 'in', side: 'in' }],
      lines: [`${tones.filter((t) => t === 'ok').length}/${pods.length} ready`],
      status: status(worst(tones)),
      dots: pods.map((p) => ({ tone: podTone(p), title: `${p.name}: ${p.status}` })),
    };
    cards.set(id, c);
    workloadCards.set(owner, c);
  }

  // Its pods' own cards (a pod's map, a node's: shown there, else its workload's dots; one of none, its own on its namespace's), each linked to its workload and its node.
  for (const p of w.pods) {
    const owner = workloadCards.get(p.workload);
    const pod = card(Pod, p.name, owner ? LAYER.used : LAYER.workload, { status: status(podTone(p), p.status), lines: [p.status] });
    port(pod, 'in', 'in');
    if (owner) link('owns', owner, port(owner, 'pods', 'out'), pod, 'in');
    if (p.node) {
      const node = card(Node, p.node, LAYER.bound);
      port(node, 'in', 'in');
      link('runs', pod, port(pod, 'node', 'out'), node, 'in');
      if (owner) link('runs', owner, port(owner, 'nodes', 'out'), node, 'in');
    }
  }

  // What keeps: claims, their state, their volumes.
  for (const claim of w.claims) {
    const name = claim.metadata?.name ?? '';
    const phase = claim.status?.phase ?? 'Pending';
    const c = card(PersistentVolumeClaim, name, LAYER.used, {
      lines: [[claim.spec?.resources?.requests?.storage, phase].filter(Boolean).join(' · ')],
      status: status(phase === 'Bound' ? 'ok' : phase === 'Lost' ? 'error' : 'warn', phase),
    });
    port(c, 'in', 'in');
    const volume = claim.spec?.volumeName;
    if (volume) {
      const pv = card(PersistentVolume, volume, LAYER.bound, { external: true });
      port(pv, 'in', 'in');
      link('binds', c, port(c, 'out', 'out'), pv, 'in');
    }
  }
  // A claim named but not there (a workload's): dashed.
  for (const c of cards.values())
    if (kindOfCard(c.id) === kindRef(PersistentVolumeClaim) && !w.claims.some((x) => x.metadata?.name === c.title))
      Object.assign(c, { missing: true, warn: `PersistentVolumeClaim ${c.title} not found` });

  // What selects: a Service, the workloads whose pods it picks.
  const serviceCards = new Map<string, MapCard>();
  for (const s of w.services) {
    const name = s.metadata?.name ?? '';
    const type = s.spec?.type ?? 'ClusterIP';
    const ports = (s.spec?.ports ?? []).map((p) => String(p.port));
    const c = card(Service, name, LAYER.service, {
      lines: [
        type === 'ExternalName' ? `ExternalName → ${s.spec?.externalName}` : [type, s.spec?.clusterIP && s.spec.clusterIP !== 'None' ? s.spec.clusterIP : 'headless'].join(' '),
      ],
    });
    port(c, 'in', 'in', ports.join(', ') || undefined, 'traffic');
    serviceCards.set(name, c);
    const selector = s.spec?.selector;
    if (!selector || !Object.keys(selector).length) continue;
    const picked = w.workloads.filter(({ object }) => picks({ matchLabels: selector }, object.spec?.template?.metadata?.labels));
    for (const { kind, object } of picked) {
      const to = workloadCards.get(`${kind.kind}/${object.metadata?.name}`);
      if (to) link('selects', c, port(c, 'out', 'out'), to, 'in');
    }
    // Its pods of no workload (or of one the map has not): theirs, by their own labels.
    const own = w.pods.filter(
      (p) => !w.workloads.some(({ kind, object }) => `${kind.kind}/${object.metadata?.name}` === p.workload) && picks({ matchLabels: selector }, labelsOf(p)),
    );
    for (const p of own) {
      const to = workloadCards.get(p.workload) ?? cards.get(mapCard(kindRef(Pod), ns, p.name));
      if (to) link('selects', c, port(c, 'out', 'out'), to, 'in');
    }
    if (!picked.length && !own.length) c.warn = `Its selector picks no pods`;
  }

  // What comes in: an Ingress, a port a host and path, to its Service (one not there: dashed).
  for (const i of w.ingresses) {
    const c = card(Ingress, i.metadata?.name ?? '', LAYER.ingress, { lines: [i.spec?.ingressClassName ?? ''].filter(Boolean) });
    const routes = [
      ...(i.spec?.defaultBackend?.service ? [{ host: '*', path: '', service: i.spec.defaultBackend.service.name }] : []),
      ...(i.spec?.rules ?? []).flatMap((r) =>
        (r.http?.paths ?? []).flatMap((p) => (p.backend.service ? [{ host: r.host ?? '*', path: p.path ?? '/', service: p.backend.service.name }] : [])),
      ),
    ];
    for (const r of routes) {
      const to = serviceCards.get(r.service) ?? card(Service, r.service, LAYER.service, { missing: true, warn: `Service ${r.service} not found` });
      port(to, 'in', 'in', undefined, 'traffic');
      link('traffic', c, port(c, `${r.host}${r.path}`, 'out', `${r.host}${r.path}`, 'traffic'), to, 'in', !serviceCards.has(r.service));
    }
  }

  // What scales a workload.
  for (const h of w.scalers) {
    const target = h.spec?.scaleTargetRef;
    const to = target && workloadCards.get(`${target.kind}/${target.name}`);
    if (!to) continue;
    const c = card(HorizontalPodAutoscaler, h.metadata?.name ?? '', LAYER.service, { lines: [`${h.spec?.minReplicas ?? 1}–${h.spec?.maxReplicas}`] });
    link('scales', c, port(c, 'out', 'out'), to, port(to, 'scale', 'in'));
  }

  return { kinds: KINDS, cards: [...cards.values()], links: [...links.values()] };
}

const POD = kindRef(Pod);
const NODE = kindRef(Node);

/** A namespace's own map: its world but its pods (their workloads' dots; one of none, its own card) and the nodes they run on. */
export function namespaceGraph(world: MapGraph): MapGraph {
  const owned = new Set(world.links.filter((l) => l.kind === 'owns').map((l) => l.to.card));
  const keep = (id: string) => (kindOfCard(id) !== POD || !owned.has(id)) && kindOfCard(id) !== NODE;
  return { ...world, cards: world.cards.filter((c) => keep(c.id)), links: world.links.filter((l) => keep(l.from.card) && keep(l.to.card)) };
}

/**
 * An object's neighbours in its world: what is linked to it, and to those, so far — each a column left or right
 * of it as its links go (back the way it came: none). Its pods its workload's dots (a card of its own only round
 * a pod, that pod's alone); a node, a link's end, not a way on (it would bring every pod on it); a pod shown, its
 * workload's own runs-on not again.
 */
export function neighboursOf(world: MapGraph, focus: string, depth = 2): MapGraph {
  const pods = kindOfCard(focus) === POD;
  // A pod's own card alone (round a pod: it, not its siblings).
  const shown = (id: string) => kindOfCard(id) !== POD || id === focus;
  const way = (l: MapLink) => shown(l.from.card) && shown(l.to.card) && !(pods && l.kind === 'runs' && kindOfCard(l.from.card) !== POD);
  const ways = world.links.filter(way);
  const layer = new Map<string, number>([[focus, 0]]);
  let edge = [focus];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of edge.filter((e) => e === focus || kindOfCard(e) !== NODE))
      for (const l of ways) {
        const [other, step] = l.from.card === id ? [l.to.card, 1] : l.to.card === id ? [l.from.card, -1] : [undefined, 0];
        if (other && !layer.has(other)) {
          layer.set(other, (layer.get(id) ?? 0) + step);
          next.push(other);
        }
      }
    edge = next;
  }
  const low = Math.min(...layer.values());
  return {
    kinds: world.kinds,
    cards: world.cards.filter((c) => layer.has(c.id)).map((c) => ({ ...c, layer: (layer.get(c.id) ?? 0) - low, ...(c.id === focus ? { main: true } : {}) })),
    links: ways.filter((l) => layer.has(l.from.card) && layer.has(l.to.card) && (layer.get(l.to.card) ?? 0) > (layer.get(l.from.card) ?? 0)),
  };
}

/** The workload kinds a namespace's world has. */
export const WORKLOADS = [Deployment, StatefulSet, DaemonSet, Job, CronJob];
