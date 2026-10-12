/*
 * The core group's v1 types (generated) and how kubectl shows its kinds (by
 * hand: printers.go, v1.37.1 — printPod, printService, printNode,
 * printNamespace, printConfigMap, printSecret, printPersistentVolume,
 * printPersistentVolumeClaim, printEvent, printPodTemplate,
 * printReplicationController, printEndpoints, printServiceAccount,
 * printResourceQuota, printComponentStatus; LimitRange: the default table).
 */

import type {
  ComponentStatus,
  ConfigMap,
  Endpoints,
  Event,
  LimitRange,
  Namespace,
  Node,
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
  PodTemplate,
  ReplicationController,
  ResourceQuota,
  Secret,
  Service,
  ServiceAccount,
} from '../../gen/core/v1.js';
import {
  accessModes,
  ageColumn,
  BETA_STORAGE_CLASS,
  containerCells,
  defaultColumns,
  formatLabels,
  hostPort,
  humanDuration,
  known,
  nameColumn,
  type PrinterColumn,
  quantity,
  quantityValue,
  ratio,
  since,
  time,
} from '../print.js';

export * from '../../gen/core/v1.js';

/** What printPod works out of a pod at once: its containers ready of all, its reason (Status), its restarts and the last of them. */
interface PodSummary {
  ready: number;
  total: number;
  reason: string;
  restarts: number;
  /** When it last restarted (ms); none: 0. */
  lastRestart: number;
}

const summaries = new WeakMap<Pod, PodSummary>();

const at = (time: string | undefined) => (time ? Date.parse(time) || 0 : 0);

/** A pod as printPod works it out: its ready containers, its reason, its restarts — once per object. */
export function podSummary(pod: Pod): PodSummary {
  const known = summaries.get(pod);
  if (known) return known;
  const spec = pod.spec;
  const status = pod.status ?? {};
  const phase = status.phase ?? '';
  let reason = status.reason || phase;
  let total = spec?.containers?.length ?? 0;
  let ready = 0;
  let restarts = 0;
  let lastRestart = 0;
  let sidecarRestarts = 0;
  let lastSidecarRestart = 0;

  // A pod gated from scheduling says so.
  for (const c of status.conditions ?? []) if (c.type === 'PodScheduled' && c.reason === 'SchedulingGated') reason = 'SchedulingGated';

  // Init containers: those that run beside the others (sidecars: restartPolicy Always) are counted with them.
  const inits = new Map((spec?.initContainers ?? []).map((c) => [c.name, c]));
  for (const c of spec?.initContainers ?? []) if (c.restartPolicy === 'Always') total++;
  const sidecar = (name: string) => inits.get(name)?.restartPolicy === 'Always';

  let initializing = false;
  const initStatuses = status.initContainerStatuses ?? [];
  for (let i = 0; i < initStatuses.length; i++) {
    const c = initStatuses[i];
    restarts += c.restartCount ?? 0;
    const lastEnd = at(c.lastState?.terminated?.finishedAt);
    if (lastEnd > lastRestart) lastRestart = lastEnd;
    if (sidecar(c.name)) {
      sidecarRestarts += c.restartCount ?? 0;
      if (lastEnd > lastSidecarRestart) lastSidecarRestart = lastEnd;
    }
    const terminated = c.state?.terminated;
    const waiting = c.state?.waiting;
    // An exit code not given is 0, as in Go.
    if (terminated && (terminated.exitCode ?? 0) === 0) continue;
    if (sidecar(c.name) && c.started) {
      if (c.ready) ready++;
      continue;
    }
    if (terminated) {
      reason = terminated.reason ? `Init:${terminated.reason}` : terminated.signal ? `Init:Signal:${terminated.signal}` : `Init:ExitCode:${terminated.exitCode ?? 0}`;
    } else if (waiting?.reason && waiting.reason !== 'PodInitializing') {
      reason = `Init:${waiting.reason}`;
    } else {
      reason = `Init:${i}/${spec?.initContainers?.length ?? 0}`;
    }
    initializing = true;
    break;
  }

  const initialized = (status.conditions ?? []).find((c) => c.type === 'Initialized')?.status === 'True';
  if (!initializing || initialized) {
    restarts = sidecarRestarts;
    lastRestart = lastSidecarRestart;
    let running = false;
    let errorReason = '';
    const statuses = status.containerStatuses ?? [];
    // The last first: the first container's reason is the one that stays.
    for (let i = statuses.length - 1; i >= 0; i--) {
      const c = statuses[i];
      restarts += c.restartCount ?? 0;
      const lastEnd = at(c.lastState?.terminated?.finishedAt);
      if (lastEnd > lastRestart) lastRestart = lastEnd;
      const terminated = c.state?.terminated;
      if (c.state?.waiting?.reason) {
        reason = c.state.waiting.reason;
      } else if (terminated) {
        reason = terminated.reason || (terminated.signal ? `Signal:${terminated.signal}` : `ExitCode:${terminated.exitCode ?? 0}`);
        if ((terminated.exitCode ?? 0) !== 0) errorReason = reason;
      } else if (c.ready && c.state?.running) {
        running = true;
        ready++;
      }
    }
    // A container still running: not Completed.
    if (reason === 'Completed') {
      const podReady = (status.conditions ?? []).some((c) => c.type === 'Ready' && c.status === 'True');
      if (running && podReady) reason = 'Running';
      else if (errorReason) reason = errorReason;
      else if (running) reason = 'NotReady';
    }
  }

  if (pod.metadata?.deletionTimestamp && status.reason === 'NodeLost') reason = 'Unknown';
  else if (pod.metadata?.deletionTimestamp && phase !== 'Succeeded' && phase !== 'Failed') reason = 'Terminating';

  const summary = { ready, total, reason, restarts, lastRestart };
  summaries.set(pod, summary);
  return summary;
}

export const podColumns: PrinterColumn<Pod>[] = [
  nameColumn,
  {
    name: 'Ready',
    type: 'string',
    value: (o) => ratio(podSummary(o).ready, podSummary(o).total),
    display: (o) => {
      const s = podSummary(o);
      return `${s.ready}/${s.total}`;
    },
  },
  { name: 'Status', type: 'string', value: (o) => podSummary(o).reason, display: (o) => podSummary(o).reason },
  {
    name: 'Restarts',
    type: 'string',
    value: (o) => podSummary(o).restarts,
    // Now read only when said (a live cell follows the clock only then).
    display: (o, context) => {
      const s = podSummary(o);
      return s.restarts !== 0 && s.lastRestart ? `${s.restarts} (${humanDuration(context.now - s.lastRestart)} ago)` : String(s.restarts);
    },
  },
  ageColumn,
  { name: 'IP', type: 'string', priority: 1, value: (o) => o.status?.podIPs?.[0]?.ip || undefined, display: (o) => o.status?.podIPs?.[0]?.ip || '<none>' },
  { name: 'Node', type: 'string', priority: 1, value: (o) => o.spec?.nodeName || undefined, display: (o) => o.spec?.nodeName || '<none>' },
  {
    name: 'Nominated Node',
    type: 'string',
    priority: 1,
    value: (o) => o.status?.nominatedNodeName || undefined,
    display: (o) => o.status?.nominatedNodeName || '<none>',
  },
  {
    name: 'Readiness Gates',
    type: 'string',
    priority: 1,
    value: (o) => {
      const gates = readinessGates(o);
      return gates && ratio(gates.met, gates.all);
    },
    display: (o) => {
      const gates = readinessGates(o);
      return gates ? `${gates.met}/${gates.all}` : '<none>';
    },
  },
];

/** A pod's readiness gates: those met, of all; none: undefined. */
function readinessGates(o: Pod): { met: number; all: number } | undefined {
  const gates = o.spec?.readinessGates ?? [];
  if (!gates.length) return undefined;
  const conditions = o.status?.conditions ?? [];
  return { met: gates.filter((g) => conditions.find((c) => c.type === g.conditionType)?.status === 'True').length, all: gates.length };
}

/** A load balancer's addresses: each one's IP, else its hostname — unique, sorted, comma-joined (loadBalancerStatusStringer, as the server calls it: wide, not clipped). */
export function loadBalancerAddresses(ingress: readonly { ip?: string; hostname?: string }[] | undefined): string {
  const found = new Set<string>();
  for (const i of ingress ?? []) {
    if (i.ip) found.add(i.ip);
    else if (i.hostname) found.add(i.hostname);
  }
  return [...found].sort().join(',');
}

/** A service's external addresses, as its type has them (getServiceExternalIP). */
function externalIP(svc: Service): string {
  const spec = svc.spec ?? {};
  const external = spec.externalIPs ?? [];
  switch (spec.type) {
    case 'ClusterIP':
    case 'NodePort':
      return external.length ? external.join(',') : '<none>';
    case 'LoadBalancer': {
      const lb = loadBalancerAddresses(svc.status?.loadBalancer?.ingress);
      if (external.length) return [...(lb ? lb.split(',') : []), ...external].join(',');
      return lb || '<pending>';
    }
    case 'ExternalName':
      return spec.externalName ?? '';
  }
  return '<unknown>';
}

/** A service's ports, port:nodePort/protocol each, comma-joined; none: undefined. */
const ports = (o: Service) =>
  (o.spec?.ports ?? []).map((p) => (p.nodePort && p.nodePort > 0 ? `${p.port}:${p.nodePort}/${p.protocol}` : `${p.port}/${p.protocol}`)).join(',') || undefined;

export const serviceColumns: PrinterColumn<Service>[] = [
  nameColumn,
  { name: 'Type', type: 'string', value: (o) => o.spec?.type, display: (o) => o.spec?.type ?? '' },
  { name: 'Cluster-IP', type: 'string', value: (o) => o.spec?.clusterIPs?.[0], display: (o) => o.spec?.clusterIPs?.[0] ?? '<none>' },
  { name: 'External-IP', type: 'string', value: (o) => known(externalIP(o)), display: externalIP },
  { name: 'Port(s)', type: 'string', value: ports, display: (o) => ports(o) ?? '<none>' },
  ageColumn,
  { name: 'Selector', type: 'string', priority: 1, value: (o) => known(formatLabels(o.spec?.selector)), display: (o) => formatLabels(o.spec?.selector) },
];

/** A node's roles: node-role.kubernetes.io/<role> labels, a kubernetes.io/role label's value — sorted (findNodeRoles). */
function nodeRoles(node: Node): string[] {
  const roles = new Set<string>();
  for (const [k, v] of Object.entries(node.metadata?.labels ?? {})) {
    if (k.startsWith('node-role.kubernetes.io/')) {
      const role = k.slice('node-role.kubernetes.io/'.length);
      if (role) roles.add(role);
    } else if (k === 'kubernetes.io/role' && v) roles.add(v);
  }
  return [...roles].sort();
}

const nodeAddress = (node: Node, type: string) => node.status?.addresses?.find((a) => a.type === type)?.address;

/** A node's status: Ready, NotReady (none: Unknown), ",SchedulingDisabled" if cordoned. */
function nodeStatus(o: Node): string {
  const ready = o.status?.conditions?.find((c) => c.type === 'Ready');
  const status = ready ? [ready.status === 'True' ? 'Ready' : 'NotReady'] : ['Unknown'];
  if (o.spec?.unschedulable) status.push('SchedulingDisabled');
  return status.join(',');
}

/** Its kernel, "(architecture)" after it. */
function kernel(o: Node): string {
  const info = o.status?.nodeInfo;
  const kernel = info?.kernelVersion || '<unknown>';
  return info?.architecture ? `${kernel} (${info.architecture})` : kernel;
}

export const nodeColumns: PrinterColumn<Node>[] = [
  nameColumn,
  { name: 'Status', type: 'string', value: nodeStatus, display: nodeStatus },
  { name: 'Roles', type: 'string', value: (o) => nodeRoles(o).join(',') || undefined, display: (o) => nodeRoles(o).join(',') || '<none>' },
  ageColumn,
  { name: 'Version', type: 'string', value: (o) => o.status?.nodeInfo?.kubeletVersion, display: (o) => o.status?.nodeInfo?.kubeletVersion ?? '' },
  { name: 'Internal-IP', type: 'string', priority: 1, value: (o) => nodeAddress(o, 'InternalIP'), display: (o) => nodeAddress(o, 'InternalIP') ?? '<none>' },
  { name: 'External-IP', type: 'string', priority: 1, value: (o) => nodeAddress(o, 'ExternalIP'), display: (o) => nodeAddress(o, 'ExternalIP') ?? '<none>' },
  { name: 'OS-Image', type: 'string', priority: 1, value: (o) => o.status?.nodeInfo?.osImage || undefined, display: (o) => o.status?.nodeInfo?.osImage || '<unknown>' },
  { name: 'Kernel-Version', type: 'string', priority: 1, value: (o) => o.status?.nodeInfo?.kernelVersion || undefined, display: kernel },
  {
    name: 'Container-Runtime',
    type: 'string',
    priority: 1,
    value: (o) => o.status?.nodeInfo?.containerRuntimeVersion || undefined,
    display: (o) => o.status?.nodeInfo?.containerRuntimeVersion || '<unknown>',
  },
];

export const namespaceColumns: PrinterColumn<Namespace>[] = [
  nameColumn,
  { name: 'Status', type: 'string', value: (o) => o.status?.phase, display: (o) => o.status?.phase ?? '' },
  ageColumn,
];

/** A config map's entries: its data and its binary data. */
const entries = (o: ConfigMap) => Object.keys(o.data ?? {}).length + Object.keys(o.binaryData ?? {}).length;

export const configMapColumns: PrinterColumn<ConfigMap>[] = [nameColumn, { name: 'Data', type: 'string', value: entries, display: (o) => String(entries(o)) }, ageColumn];

export const secretColumns: PrinterColumn<Secret>[] = [
  nameColumn,
  { name: 'Type', type: 'string', value: (o) => o.type, display: (o) => o.type ?? '' },
  { name: 'Data', type: 'string', value: (o) => Object.keys(o.data ?? {}).length, display: (o) => String(Object.keys(o.data ?? {}).length) },
  ageColumn,
];

/** A volume's or a claim's state: Terminating once deleted, else its phase. */
const volumeStatus = (o: PersistentVolume | PersistentVolumeClaim) => (o.metadata?.deletionTimestamp ? 'Terminating' : (o.status?.phase ?? ''));

/** The storage class a volume or a claim names: the beta annotation first; none: undefined. */
const storageClass = (o: PersistentVolume | PersistentVolumeClaim) => o.metadata?.annotations?.[BETA_STORAGE_CLASS] ?? o.spec?.storageClassName;

/** The claim a volume is bound to, namespace/name; none: undefined. */
const claim = (o: PersistentVolume) => (o.spec?.claimRef ? `${o.spec.claimRef.namespace ?? ''}/${o.spec.claimRef.name ?? ''}` : undefined);

export const persistentVolumeColumns: PrinterColumn<PersistentVolume>[] = [
  nameColumn,
  { name: 'Capacity', type: 'string', value: (o) => quantityValue(o.spec?.capacity?.storage), display: (o) => quantity(o.spec?.capacity?.storage) },
  { name: 'Access Modes', type: 'string', value: (o) => known(accessModes(o.spec?.accessModes)), display: (o) => accessModes(o.spec?.accessModes) },
  {
    name: 'Reclaim Policy',
    type: 'string',
    value: (o) => o.spec?.persistentVolumeReclaimPolicy,
    display: (o) => o.spec?.persistentVolumeReclaimPolicy ?? '',
  },
  { name: 'Status', type: 'string', value: (o) => known(volumeStatus(o)), display: volumeStatus },
  { name: 'Claim', type: 'string', value: claim, display: (o) => claim(o) ?? '' },
  { name: 'StorageClass', type: 'string', value: storageClass, display: (o) => storageClass(o) ?? '' },
  {
    name: 'VolumeAttributesClass',
    type: 'string',
    value: (o) => o.spec?.volumeAttributesClassName,
    display: (o) => o.spec?.volumeAttributesClassName ?? '<unset>',
  },
  { name: 'Reason', type: 'string', value: (o) => o.status?.reason, display: (o) => o.status?.reason ?? '' },
  ageColumn,
  { name: 'VolumeMode', type: 'string', priority: 1, value: (o) => o.spec?.volumeMode, display: (o) => o.spec?.volumeMode ?? '<unset>' },
];

export const persistentVolumeClaimColumns: PrinterColumn<PersistentVolumeClaim>[] = [
  nameColumn,
  { name: 'Status', type: 'string', value: (o) => known(volumeStatus(o)), display: volumeStatus },
  { name: 'Volume', type: 'string', value: (o) => o.spec?.volumeName, display: (o) => o.spec?.volumeName ?? '' },
  // Bound (a volume named): its capacity and access modes, as the volume gives them.
  {
    name: 'Capacity',
    type: 'string',
    value: (o) => (o.spec?.volumeName ? quantityValue(o.status?.capacity?.storage) : undefined),
    display: (o) => (o.spec?.volumeName ? quantity(o.status?.capacity?.storage) : ''),
  },
  {
    name: 'Access Modes',
    type: 'string',
    value: (o) => (o.spec?.volumeName ? accessModes(o.status?.accessModes) : undefined),
    display: (o) => (o.spec?.volumeName ? accessModes(o.status?.accessModes) : ''),
  },
  { name: 'StorageClass', type: 'string', value: storageClass, display: (o) => storageClass(o) ?? '' },
  {
    name: 'VolumeAttributesClass',
    type: 'string',
    value: (o) => o.spec?.volumeAttributesClassName,
    display: (o) => o.spec?.volumeAttributesClassName ?? '<unset>',
  },
  ageColumn,
  { name: 'VolumeMode', type: 'string', priority: 1, value: (o) => o.spec?.volumeMode, display: (o) => o.spec?.volumeMode ?? '<unset>' },
];

/** When an event was first seen: firstTimestamp, else eventTime (the newer events'). */
const firstSeen = (o: Event) => o.firstTimestamp || o.eventTime;

/** When it was last seen: its series' last, else lastTimestamp, else when it was first seen. */
const lastSeen = (o: Event) => (o.series ? o.series.lastObservedTime : o.lastTimestamp || firstSeen(o));

/** The object it is about, kind/name (the kind lowercased). */
function involved(o: Event): string {
  const kind = (o.involvedObject.kind ?? '').toLowerCase();
  return o.involvedObject.name ? `${kind}/${o.involvedObject.name}` : kind;
}

/** Who reported it: the component, ", instance" after it. */
function source(o: Event): string {
  const component = o.source?.component || o.reportingComponent || '';
  const instance = o.source?.host || o.reportingInstance || '';
  return instance ? `${component}, ${instance}` : component;
}

/** How many times it happened: its series' count, else its own (0: once). */
const times = (o: Event) => (o.series ? (o.series.count ?? 0) : o.count || 1);

export const eventColumns: PrinterColumn<Event>[] = [
  { name: 'Last Seen', type: 'string', value: (o) => time(lastSeen(o)), display: (o, { now }) => since(lastSeen(o), now) },
  { name: 'Type', type: 'string', value: (o) => o.type, display: (o) => o.type ?? '' },
  { name: 'Reason', type: 'string', value: (o) => o.reason, display: (o) => o.reason ?? '' },
  { name: 'Object', type: 'string', value: (o) => known(involved(o)), display: involved },
  { name: 'Subobject', type: 'string', priority: 1, value: (o) => o.involvedObject.fieldPath, display: (o) => o.involvedObject.fieldPath ?? '' },
  { name: 'Source', type: 'string', priority: 1, value: (o) => known(source(o)), display: source },
  { name: 'Message', type: 'string', value: (o) => (o.message ?? '').trim() || undefined, display: (o) => (o.message ?? '').trim() },
  { name: 'First Seen', type: 'string', priority: 1, value: (o) => time(firstSeen(o)), display: (o, { now }) => since(firstSeen(o), now) },
  { name: 'Count', type: 'string', priority: 1, value: times, display: (o) => String(times(o)) },
  { ...nameColumn, priority: 1 },
];

export const podTemplateColumns: PrinterColumn<PodTemplate>[] = [
  nameColumn,
  {
    name: 'Containers',
    type: 'string',
    value: (o) => known(containerCells(o.template?.spec?.containers).names),
    display: (o) => containerCells(o.template?.spec?.containers).names,
  },
  { name: 'Images', type: 'string', value: (o) => known(containerCells(o.template?.spec?.containers).images), display: (o) => containerCells(o.template?.spec?.containers).images },
  { name: 'Pod Labels', type: 'string', value: (o) => known(formatLabels(o.template?.metadata?.labels)), display: (o) => formatLabels(o.template?.metadata?.labels) },
];

export const replicationControllerColumns: PrinterColumn<ReplicationController>[] = [
  nameColumn,
  { name: 'Desired', type: 'integer', value: (o) => o.spec?.replicas ?? 0, display: (o) => String(o.spec?.replicas ?? 0) },
  { name: 'Current', type: 'integer', value: (o) => o.status?.replicas ?? 0, display: (o) => String(o.status?.replicas ?? 0) },
  { name: 'Ready', type: 'integer', value: (o) => o.status?.readyReplicas ?? 0, display: (o) => String(o.status?.readyReplicas ?? 0) },
  ageColumn,
  {
    name: 'Containers',
    type: 'string',
    priority: 1,
    value: (o) => known(containerCells(o.spec?.template?.spec?.containers).names),
    display: (o) => containerCells(o.spec?.template?.spec?.containers).names,
  },
  {
    name: 'Images',
    type: 'string',
    priority: 1,
    value: (o) => known(containerCells(o.spec?.template?.spec?.containers).images),
    display: (o) => containerCells(o.spec?.template?.spec?.containers).images,
  },
  { name: 'Selector', type: 'string', priority: 1, value: (o) => known(formatLabels(o.spec?.selector)), display: (o) => formatLabels(o.spec?.selector) },
];

/** An endpoints' addresses with their ports (headless: addresses alone), the first three, "+ n more..." past them; no subsets: "<none>" (formatEndpoints). */
function endpoints(o: Endpoints): string {
  if (!o.subsets?.length) return '<none>';
  const list: string[] = [];
  let more = false;
  let count = 0;
  for (const ss of o.subsets) {
    const addresses = ss.addresses ?? [];
    for (const port of ss.ports?.length ? ss.ports : [undefined]) {
      count += addresses.length;
      for (const a of addresses) {
        if (list.length === 3) {
          more = true;
          break;
        }
        list.push(port ? hostPort(a.ip, port.port) : a.ip);
      }
    }
  }
  return more ? `${list.join(',')} + ${count - 3} more...` : list.join(',');
}

export const endpointsColumns: PrinterColumn<Endpoints>[] = [nameColumn, { name: 'Endpoints', type: 'string', value: (o) => known(endpoints(o)), display: endpoints }, ageColumn];

export const serviceAccountColumns: PrinterColumn<ServiceAccount>[] = [nameColumn, ageColumn];

/** A quota's resources (sorted): requests in one column, limits.* in the other — "name: used/hard" each (printResourceQuota). */
function quotas(o: ResourceQuota, limits: boolean): string {
  const hard = o.status?.hard ?? {};
  return Object.keys(hard)
    .sort()
    .filter((r) => (r.split('.').length > 1 && r.split('.')[0] === 'limits') === limits)
    .map((r) => `${r}: ${quantity(o.status?.used?.[r])}/${quantity(hard[r])}`)
    .join(', ');
}

export const resourceQuotaColumns: PrinterColumn<ResourceQuota>[] = [
  nameColumn,
  { name: 'Request', type: 'string', value: (o) => known(quotas(o, false)), display: (o) => quotas(o, false) },
  { name: 'Limit', type: 'string', value: (o) => known(quotas(o, true)), display: (o) => quotas(o, true) },
  ageColumn,
];

/** A component's health: its Healthy condition — Healthy or Unhealthy, its message and error; none: Unknown. */
const healthy = (o: ComponentStatus) => o.conditions?.find((c) => c.type === 'Healthy');

function health(o: ComponentStatus): string {
  const c = healthy(o);
  return c ? (c.status === 'True' ? 'Healthy' : 'Unhealthy') : 'Unknown';
}

export const componentStatusColumns: PrinterColumn<ComponentStatus>[] = [
  nameColumn,
  { name: 'Status', type: 'string', value: health, display: health },
  { name: 'Message', type: 'string', value: (o) => healthy(o)?.message, display: (o) => healthy(o)?.message ?? '' },
  { name: 'Error', type: 'string', value: (o) => healthy(o)?.error, display: (o) => healthy(o)?.error ?? '' },
];

/** No printer of its own: the default table. */
export const limitRangeColumns: PrinterColumn<LimitRange>[] = defaultColumns;
